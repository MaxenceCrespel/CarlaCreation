import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { Expense } from '../../database/entities/expense.entity';

describe('ExpensesService', () => {
  let service: ExpensesService;
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
      providers: [ExpensesService, { provide: getRepositoryToken(Expense), useValue: repo }],
    }).compile();

    service = module.get(ExpensesService);
  });

  it('findAll without a range returns every expense, most recent first', async () => {
    repo.find.mockResolvedValue([]);
    await service.findAll();
    expect(repo.find).toHaveBeenCalledWith({ order: { expense_date: 'DESC' } });
  });

  it('findAll rejects an invalid date range', async () => {
    await expect(service.findAll('2026-02-01', '2026-01-01')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create defaults category to "Autre" and trims the description', async () => {
    const result = await service.create({ expenseDate: '2026-08-06', amountCents: 4500, description: '  Achat vernis  ' } as any);
    expect(result).toMatchObject({ expense_date: '2026-08-06', category: 'Autre', description: 'Achat vernis', amount_cents: 4500 });
  });

  it('create rejects an invalid date', async () => {
    await expect(service.create({ expenseDate: 'not-a-date', amountCents: 100 } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update throws NotFoundException for a missing expense', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.update(999, { amountCents: 100 } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update only changes provided fields', async () => {
    repo.findOne.mockResolvedValue({ id: 1, expense_date: '2026-08-06', category: 'Produits', description: '', amount_cents: 4500 });
    await service.update(1, { amountCents: 5000 } as any);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ amount_cents: 5000, category: 'Produits' }));
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
