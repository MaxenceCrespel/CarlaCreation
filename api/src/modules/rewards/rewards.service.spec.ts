import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { RewardsService } from './rewards.service';
import { Client } from '../../database/entities/client.entity';
import { SettingsService } from '../settings/settings.service';
import { PromotionsService } from '../promotions/promotions.service';
import { MailService } from '../mail/mail.service';

describe('RewardsService', () => {
  let service: RewardsService;
  let clientRepo: { findOne: jest.Mock; save: jest.Mock; update: jest.Mock };
  let dataSource: { query: jest.Mock };
  let settingsService: { getLoyaltyVisitsRequired: jest.Mock; getLoyaltyDiscountPercent: jest.Mock; getBirthdayDiscountPercent: jest.Mock };
  let promotionsService: { createAutoCode: jest.Mock };
  let mailService: { sendLoyaltyReward: jest.Mock; sendBirthdayReward: jest.Mock };

  beforeEach(async () => {
    clientRepo = { findOne: jest.fn(), save: jest.fn((v) => Promise.resolve(v)), update: jest.fn() };
    dataSource = { query: jest.fn() };
    settingsService = {
      getLoyaltyVisitsRequired: jest.fn().mockResolvedValue(5),
      getLoyaltyDiscountPercent: jest.fn().mockResolvedValue(15),
      getBirthdayDiscountPercent: jest.fn().mockResolvedValue(10),
    };
    promotionsService = { createAutoCode: jest.fn().mockResolvedValue({ code: 'ABCD1234' }) };
    mailService = { sendLoyaltyReward: jest.fn(), sendBirthdayReward: jest.fn() };

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

  describe('checkLoyaltyReward', () => {
    const CLIENT = { id: 1, name: 'Jeanne Dupont', email: 'jeanne@example.com', loyalty_reward_at_visits: null };

    it('issues a reward when the completed-visit count hits a fresh multiple of the threshold', async () => {
      clientRepo.findOne.mockResolvedValue({ ...CLIENT });
      dataSource.query.mockResolvedValue([{ count: 5 }]);

      await service.checkLoyaltyReward(1);

      expect(promotionsService.createAutoCode).toHaveBeenCalledWith(expect.stringContaining('Jeanne Dupont'), 15);
      expect(mailService.sendLoyaltyReward).toHaveBeenCalledWith({
        clientName: 'Jeanne Dupont',
        clientEmail: 'jeanne@example.com',
        code: 'ABCD1234',
        discountPercent: 15,
        visitsCompleted: 5,
      });
      expect(clientRepo.save).toHaveBeenCalledWith(expect.objectContaining({ loyalty_reward_at_visits: 5 }));
    });

    it('does nothing when the visit count is not a multiple of the threshold', async () => {
      clientRepo.findOne.mockResolvedValue({ ...CLIENT });
      dataSource.query.mockResolvedValue([{ count: 3 }]);

      await service.checkLoyaltyReward(1);

      expect(promotionsService.createAutoCode).not.toHaveBeenCalled();
    });

    it('does nothing when a reward was already issued at this exact visit count', async () => {
      clientRepo.findOne.mockResolvedValue({ ...CLIENT, loyalty_reward_at_visits: 5 });
      dataSource.query.mockResolvedValue([{ count: 5 }]);

      await service.checkLoyaltyReward(1);

      expect(promotionsService.createAutoCode).not.toHaveBeenCalled();
    });

    it('issues a second reward once the count reaches the next multiple', async () => {
      clientRepo.findOne.mockResolvedValue({ ...CLIENT, loyalty_reward_at_visits: 5 });
      dataSource.query.mockResolvedValue([{ count: 10 }]);

      await service.checkLoyaltyReward(1);

      expect(promotionsService.createAutoCode).toHaveBeenCalled();
    });

    it('does nothing for a client with no email on file', async () => {
      clientRepo.findOne.mockResolvedValue({ ...CLIENT, email: '' });
      dataSource.query.mockResolvedValue([{ count: 5 }]);

      await service.checkLoyaltyReward(1);

      expect(promotionsService.createAutoCode).not.toHaveBeenCalled();
    });

    it('swallows errors instead of throwing (must never block a status change)', async () => {
      clientRepo.findOne.mockRejectedValue(new Error('DB is down'));

      await expect(service.checkLoyaltyReward(1)).resolves.toBeUndefined();
    });
  });

  describe('dispatchBirthdayRewards', () => {
    it('rewards a client whose birthday is today and was not rewarded this year yet', async () => {
      dataSource.query.mockResolvedValue([{ id: 1, name: 'Paul Martin', email: 'paul@example.com' }]);

      await service.dispatchBirthdayRewards();

      expect(promotionsService.createAutoCode).toHaveBeenCalledWith(expect.stringContaining('Paul Martin'), 10);
      expect(mailService.sendBirthdayReward).toHaveBeenCalledWith(
        expect.objectContaining({ clientName: 'Paul Martin', clientEmail: 'paul@example.com', code: 'ABCD1234', discountPercent: 10 }),
      );
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
      promotionsService.createAutoCode.mockRejectedValueOnce(new Error('Stripe-unrelated failure')).mockResolvedValueOnce({ code: 'WXYZ9876' });

      await service.dispatchBirthdayRewards();

      expect(mailService.sendBirthdayReward).toHaveBeenCalledTimes(1);
      expect(mailService.sendBirthdayReward).toHaveBeenCalledWith(expect.objectContaining({ clientName: 'Works' }));
    });
  });
});
