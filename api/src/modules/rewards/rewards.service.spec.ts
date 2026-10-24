import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { Client } from '../../database/entities/client.entity';
import { SettingsService } from '../settings/settings.service';
import { PromotionsService } from '../promotions/promotions.service';
import { MailService } from '../mail/mail.service';

describe('RewardsService', () => {
  let service: RewardsService;
  let clientRepo: { findOne: jest.Mock; update: jest.Mock };
  let dataSource: { query: jest.Mock; transaction: jest.Mock };
  let settingsService: { getBirthdayDiscountPercent: jest.Mock };
  let promotionsService: { createAutoCode: jest.Mock };
  let mailService: { sendRedeemedReward: jest.Mock; sendBirthdayReward: jest.Mock };

  beforeEach(async () => {
    clientRepo = { findOne: jest.fn(), update: jest.fn() };
    dataSource = { query: jest.fn(), transaction: jest.fn() };
    settingsService = { getBirthdayDiscountPercent: jest.fn().mockResolvedValue(10) };
    promotionsService = { createAutoCode: jest.fn().mockResolvedValue({ code: 'ABCD1234' }) };
    mailService = { sendRedeemedReward: jest.fn(), sendBirthdayReward: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RewardsService,
        { provide: getRepositoryToken(Client), useValue: clientRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: SettingsService, useValue: settingsService },
        { provide: PromotionsService, useValue: promotionsService },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get(RewardsService);
  });

  describe('onReservationsCompleted', () => {
    function mockRows(rows: unknown[]) {
      dataSource.query.mockImplementation(async (sql: string) => (sql.includes('FROM reservations r') ? rows : []));
    }
    const pointsInserts = () => dataSource.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO loyalty_points'));

    it('earns 1 point per full 4 € of net prestation, idempotently keyed by reservation', async () => {
      mockRows([{ id: 7, client_id: 1, price_cents: 4500, addons_cents: '1000', discount_percent: 0, discount_cents: 0 }]); // 55 € -> 13
      clientRepo.findOne.mockResolvedValue({ id: 1, referred_by_client_id: null });

      await service.onReservationsCompleted([7]);

      expect(pointsInserts()).toHaveLength(1);
      expect(pointsInserts()[0][1]).toEqual([1, 13, 'purchase', 'purchase:7']);
    });

    it('computes points after the percent and euro discounts', async () => {
      mockRows([{ id: 8, client_id: 1, price_cents: 5000, addons_cents: '0', discount_percent: 10, discount_cents: 500 }]); // 45-5 = 40 € -> 10
      clientRepo.findOne.mockResolvedValue({ id: 1, referred_by_client_id: null });

      await service.onReservationsCompleted([8]);

      expect(pointsInserts()[0][1]).toEqual([1, 10, 'purchase', 'purchase:8']);
    });

    it('awards nothing below 4 €', async () => {
      mockRows([{ id: 9, client_id: 1, price_cents: 300, addons_cents: '0', discount_percent: 0, discount_cents: 0 }]);
      clientRepo.findOne.mockResolvedValue({ id: 1, referred_by_client_id: null });

      await service.onReservationsCompleted([9]);

      expect(pointsInserts()).toHaveLength(0);
    });

    it('validates a referral on the referee first completed reservation: 20 to the sponsor, 10 to the referee', async () => {
      mockRows([{ id: 7, client_id: 2, price_cents: 100, addons_cents: '0', discount_percent: 0, discount_cents: 0 }]);
      clientRepo.findOne.mockImplementation(async ({ where }: { where: { id: number } }) =>
        where.id === 2 ? { id: 2, referred_by_client_id: 1, referral_rewarded_at: null } : { id: 1 },
      );

      await service.onReservationsCompleted([7]);

      expect(pointsInserts().map((c) => c[1])).toEqual([
        [1, 20, 'referral_sponsor', 'referral:sponsor:2'],
        [2, 10, 'referral_referee', 'referral:referee:2'],
      ]);
      expect(clientRepo.update).toHaveBeenCalledWith({ id: 2 }, { referral_rewarded_at: expect.any(Date) });
    });

    it('does not reward a referral twice', async () => {
      mockRows([{ id: 7, client_id: 2, price_cents: 100, addons_cents: '0', discount_percent: 0, discount_cents: 0 }]);
      clientRepo.findOne.mockResolvedValue({ id: 2, referred_by_client_id: 1, referral_rewarded_at: new Date() });

      await service.onReservationsCompleted([7]);

      expect(pointsInserts()).toHaveLength(0);
    });

    it('swallows errors (must never block a status change)', async () => {
      dataSource.query.mockRejectedValue(new Error('DB is down'));
      await expect(service.onReservationsCompleted([1])).resolves.toBeUndefined();
    });
  });

  describe('redeem', () => {
    function mockTransaction(balance: number) {
      const manager = {
        query: jest.fn(async (sql: string) => (sql.includes('SUM(points)') ? [{ total: String(balance) }] : [])),
      };
      dataSource.transaction.mockImplementation(async (fn: (m: unknown) => unknown) => fn(manager));
      return manager;
    }

    it('rejects an unknown tier', async () => {
      await expect(service.redeem(1, 60)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the balance is too low, without debiting', async () => {
      clientRepo.findOne.mockResolvedValue({ id: 1, name: 'Jeanne', email: 'j@e.com' });
      const manager = mockTransaction(40);

      await expect(service.redeem(1, 50)).rejects.toBeInstanceOf(BadRequestException);
      expect(manager.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO loyalty_points'))).toBe(false);
    });

    it('debits the points and issues a single-use euro code, then emails it', async () => {
      clientRepo.findOne.mockResolvedValue({ id: 1, name: 'Jeanne', email: 'j@e.com' });
      const manager = mockTransaction(120);

      const result = await service.redeem(1, 100);

      expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO loyalty_points'), [1, -100]);
      expect(promotionsService.createAutoCode).toHaveBeenCalledWith(expect.stringContaining('Jeanne'), 0, 1, { amountCents: 1200, manager });
      expect(mailService.sendRedeemedReward).toHaveBeenCalledWith({ clientName: 'Jeanne', clientEmail: 'j@e.com', code: 'ABCD1234', amountCents: 1200 });
      expect(result).toEqual({ code: 'ABCD1234', amountCents: 1200 });
    });
  });

  describe('dispatchBirthdayRewards', () => {
    it('issues a 10% code valid one month and marks the year', async () => {
      dataSource.query.mockResolvedValue([{ id: 1, name: 'Paul Martin', email: 'paul@example.com' }]);

      await service.dispatchBirthdayRewards();

      const opts = promotionsService.createAutoCode.mock.calls[0][3];
      expect(promotionsService.createAutoCode).toHaveBeenCalledWith(expect.stringContaining('Paul Martin'), 10, 1, { expiresAt: expect.any(Date) });
      expect(opts.expiresAt.getTime()).toBeGreaterThan(Date.now() + 27 * 86_400_000);
      expect(mailService.sendBirthdayReward).toHaveBeenCalledWith(expect.objectContaining({ code: 'ABCD1234', discountPercent: 10, validUntil: expect.any(Date) }));
      expect(clientRepo.update).toHaveBeenCalledWith({ id: 1 }, { birthday_reward_year: expect.any(Number) });
    });

    it('does nothing when no client matches today', async () => {
      dataSource.query.mockResolvedValue([]);
      await service.dispatchBirthdayRewards();
      expect(promotionsService.createAutoCode).not.toHaveBeenCalled();
    });

    it('keeps going for remaining clients if one reward fails', async () => {
      dataSource.query.mockResolvedValue([
        { id: 1, name: 'Fails', email: 'fails@example.com' },
        { id: 2, name: 'Works', email: 'works@example.com' },
      ]);
      promotionsService.createAutoCode.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ code: 'WXYZ9876' });

      await service.dispatchBirthdayRewards();

      expect(mailService.sendBirthdayReward).toHaveBeenCalledTimes(1);
    });
  });
});
