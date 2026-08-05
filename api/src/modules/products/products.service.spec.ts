import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Product } from '../../database/entities/product.entity';

describe('ProductsService', () => {
  let service: ProductsService;
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
      providers: [ProductsService, { provide: getRepositoryToken(Product), useValue: repo }],
    }).compile();

    service = module.get(ProductsService);
  });

  it('findAll returns products sorted by name', async () => {
    repo.find.mockResolvedValue([]);
    await service.findAll();
    expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
  });

  it('create defaults unit to "unité" and quantity/threshold/price to 0 when omitted', async () => {
    const result = await service.create({ name: '  Oxydant 20 vol  ' } as any);
    expect(result).toMatchObject({ name: 'Oxydant 20 vol', unit: 'unité', quantity: 0, low_stock_threshold: 0, purchase_price_cents: 0, notes: '' });
  });

  it('create trims text fields and keeps provided quantity/threshold/unit/price', async () => {
    const result = await service.create({ name: 'Vernis rouge', unit: 'flacon', quantity: 12, lowStockThreshold: 3, purchasePriceCents: 450, notes: ' commande mensuelle ' } as any);
    expect(result).toMatchObject({ name: 'Vernis rouge', unit: 'flacon', quantity: 12, low_stock_threshold: 3, purchase_price_cents: 450, notes: 'commande mensuelle' });
  });

  it('update throws NotFoundException for a missing product', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.update(999, { quantity: 5 } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update only changes provided fields', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'Vernis rouge', unit: 'flacon', quantity: 12, low_stock_threshold: 3, purchase_price_cents: 450, notes: '' });
    await service.update(1, { quantity: 8 } as any);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ quantity: 8, name: 'Vernis rouge', unit: 'flacon', purchase_price_cents: 450 }));
  });

  it('update changes the purchase price when provided', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'Vernis rouge', unit: 'flacon', quantity: 12, low_stock_threshold: 3, purchase_price_cents: 450, notes: '' });
    await service.update(1, { purchasePriceCents: 600 } as any);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ purchase_price_cents: 600 }));
  });

  it("update falls back to 'unité' if the unit is cleared to an empty string", async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'Vernis rouge', unit: 'flacon', quantity: 12, low_stock_threshold: 3, notes: '' });
    await service.update(1, { unit: '   ' } as any);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ unit: 'unité' }));
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
