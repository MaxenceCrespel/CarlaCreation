import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { Promotion } from '../../database/entities/promotion.entity';

describe('PromotionsService', () => {
  let service: PromotionsService;
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    repo = {
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
});
