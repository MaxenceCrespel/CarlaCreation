import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { Promotion } from '../../database/entities/promotion.entity';

describe('PromotionsService', () => {
  let service: PromotionsService;
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock; createQueryBuilder: jest.Mock };
  let qb: { update: jest.Mock; set: jest.Mock; where: jest.Mock; execute: jest.Mock };

  beforeEach(async () => {
    qb = { update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue({ affected: 1 }) };
    repo = {
      createQueryBuilder: jest.fn(() => qb),
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve({ id: 1, ...v })),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PromotionsService, { provide: getRepositoryToken(Promotion), useValue: repo }],
    }).compile();

    service = module.get(PromotionsService);
  });

  it('releaseCodes gives back only personal, spent codes', async () => {
    await service.releaseCodes([4, 5]);
    expect(qb.set).toHaveBeenCalledWith(expect.objectContaining({ used_at: null }));
    expect(qb.where).toHaveBeenCalledWith(expect.stringContaining('client_id IS NOT NULL AND used_at IS NOT NULL'), { ids: [4, 5] });
  });

  it('releaseCodes extends a code that expired while the booking was pending', async () => {
    await service.releaseCodes([4]);
    const { expires_at } = qb.set.mock.calls[0][0];
    expect(expires_at()).toContain('now() + interval');
  });

  it('reclaimCodes spends again only personal, unspent codes', async () => {
    await service.reclaimCodes([4]);
    expect(qb.where).toHaveBeenCalledWith(expect.stringContaining('client_id IS NOT NULL AND used_at IS NULL'), { ids: [4] });
  });

  it('release/reclaim do nothing without ids', async () => {
    await service.releaseCodes([]);
    await service.reclaimCodes([]);
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('findSelectable only returns active, non-code promotions', async () => {
    repo.find.mockResolvedValue([]);
    await service.findSelectable();
    expect(repo.find).toHaveBeenCalledWith({ where: { active: true, requires_code: false }, order: { label: 'ASC' } });
  });

  it('findByCode normalizes the code to uppercase before matching', async () => {
    repo.findOne.mockResolvedValue({ id: 1, code: 'BIENVENUE10' });
    await service.findByCode('  bienvenue10 ');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { code: 'BIENVENUE10', active: true, requires_code: true } });
  });

  it('findByCode throws NotFoundException when no active code matches', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findByCode('unknown')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create builds a selectable rate (no code) when requiresCode is omitted', async () => {
    const result = await service.create({ label: 'Tarif étudiant', discountPercent: 10 } as any);
    expect(result).toMatchObject({ label: 'Tarif étudiant', discount_percent: 10, requires_code: false, code: null });
  });

  it('create rejects a code-required promotion with no code provided', async () => {
    await expect(service.create({ label: 'Bienvenue', discountPercent: 10, requiresCode: true } as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('create normalizes and stores the code for a code-based promotion', async () => {
    repo.findOne.mockResolvedValue(null);
    const result = await service.create({ label: 'Bienvenue', discountPercent: 10, requiresCode: true, code: 'bienvenue10' } as any);
    expect(result).toMatchObject({ requires_code: true, code: 'BIENVENUE10' });
  });

  it('create rejects a duplicate code', async () => {
    repo.findOne.mockResolvedValue({ id: 99, code: 'BIENVENUE10' });
    await expect(
      service.create({ label: 'Bienvenue 2', discountPercent: 5, requiresCode: true, code: 'BIENVENUE10' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('update throws NotFoundException for a missing promotion', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.update(999, { active: false } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update only changes provided fields', async () => {
    repo.findOne.mockResolvedValue({ id: 1, label: 'Tarif étudiant', discount_percent: 10, requires_code: false, code: null, active: true });
    await service.update(1, { active: false } as any);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ active: false, label: 'Tarif étudiant', discount_percent: 10 }));
  });

  it('remove throws NotFoundException when nothing was deleted', async () => {
    repo.delete.mockResolvedValue({ affected: 0 });
    await expect(service.remove(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove succeeds silently when a row was deleted', async () => {
    repo.delete.mockResolvedValue({ affected: 1 });
    await expect(service.remove(1)).resolves.toBeUndefined();
  });

  describe('createAutoCode', () => {
    it('creates an active, code-required promotion with a freshly generated code', async () => {
      repo.findOne.mockResolvedValue(null); // no collision

      const promotion = await service.createAutoCode('Fidélité — Jeanne (5e passage)', 15, 7);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Fidélité — Jeanne (5e passage)',
          discount_percent: 15,
          requires_code: true,
          active: true,
          client_id: 7,
          code: expect.stringMatching(/^[A-Z0-9]{8}$/),
        }),
      );
      expect(promotion.code).toMatch(/^[A-Z0-9]{8}$/);
    });

    it('retries when a generated code collides with an existing one', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);

      await service.createAutoCode('Anniversaire — Paul (2026)', 10, 8);

      expect(repo.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('personal reward codes', () => {
    const PERSONAL = { id: 5, code: 'ABCD2345', active: true, requires_code: true, client_id: 7, used_at: null };

    it('accepts a personal code for its owner', async () => {
      repo.findOne.mockResolvedValue(PERSONAL);
      await expect(service.findByCode('abcd2345', 7)).resolves.toBe(PERSONAL);
    });

    it('rejects it for another account or a guest, without revealing it exists', async () => {
      repo.findOne.mockResolvedValue(PERSONAL);
      await expect(service.findByCode('ABCD2345', 8)).rejects.toThrow('Code promo invalide ou expiré.');
      await expect(service.findByCode('ABCD2345', null)).rejects.toThrow('Code promo invalide ou expiré.');
    });

    it('rejects an already used code', async () => {
      repo.findOne.mockResolvedValue({ ...PERSONAL, used_at: new Date() });
      await expect(service.findByCode('ABCD2345', 7)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('leaves admin-created (ownerless) codes usable by anyone', async () => {
      const shared = { id: 1, code: 'BIENVENUE10', active: true, requires_code: true, client_id: null, used_at: null };
      repo.findOne.mockResolvedValue(shared);
      await expect(service.findByCode('BIENVENUE10', null)).resolves.toBe(shared);
    });
  });

  describe('expiry and euro codes', () => {
    it('rejects an expired code', async () => {
      repo.findOne.mockResolvedValue({ id: 5, code: 'ANNIV123', active: true, requires_code: true, client_id: 7, used_at: null, expires_at: new Date(Date.now() - 1000) });
      await expect(service.findByCode('ANNIV123', 7)).rejects.toThrow('Ce code promo a expiré.');
    });

    it('accepts a code that has not expired yet', async () => {
      const promo = { id: 5, code: 'ANNIV123', active: true, requires_code: true, client_id: 7, used_at: null, expires_at: new Date(Date.now() + 86_400_000) };
      repo.findOne.mockResolvedValue(promo);
      await expect(service.findByCode('ANNIV123', 7)).resolves.toBe(promo);
    });

    it('createAutoCode stores a fixed euro amount with 0 %, and an expiry', async () => {
      repo.findOne.mockResolvedValue(null);
      const expiresAt = new Date();
      await service.createAutoCode('Fidélité', 0, 7, { amountCents: 500, expiresAt });
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ discount_percent: 0, discount_cents: 500, expires_at: expiresAt }));
    });
  });
});
