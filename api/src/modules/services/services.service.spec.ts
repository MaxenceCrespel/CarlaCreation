import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ServicesService } from './services.service';
import { Service } from '../../database/entities/service.entity';
import { ServiceAddon } from '../../database/entities/service-addon.entity';

describe('ServicesService', () => {
  let service: ServicesService;
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let addonRepo: { find: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let manager: { create: jest.Mock; save: jest.Mock; delete: jest.Mock; insert: jest.Mock; find: jest.Mock };

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve(v)),
      delete: jest.fn(),
    };
    addonRepo = { find: jest.fn().mockResolvedValue([]) };
    manager = {
      create: jest.fn((_entity, v) => v),
      save: jest.fn((v) => Promise.resolve({ id: 1, ...v })),
      delete: jest.fn(),
      insert: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    dataSource = {
      transaction: jest.fn((fn) => fn(manager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: getRepositoryToken(Service), useValue: repo },
        { provide: getRepositoryToken(ServiceAddon), useValue: addonRepo },
      ],
    }).compile();

    service = module.get(ServicesService);
  });

  it('findAllActive only queries active services, ordered by category then id', async () => {
    repo.find.mockResolvedValue([]);
    await service.findAllActive();
    expect(repo.find).toHaveBeenCalledWith({ where: { active: true }, order: { category: 'ASC', id: 'ASC' } });
  });

  it('findAllActive attaches each active addon to its own service, in the same request', async () => {
    repo.find.mockResolvedValue([{ id: 1, name: 'Manucure Classique' }, { id: 2, name: 'Coupe Femme' }]);
    addonRepo.find.mockResolvedValue([
      { id: 10, service_id: 1, name: 'Nail Art', extra_price_cents: 1000, extra_duration_minutes: 15, active: true },
    ]);

    const result = await service.findAllActive();

    expect(result.find((s) => s.id === 1)?.addons).toHaveLength(1);
    expect(result.find((s) => s.id === 2)?.addons).toHaveLength(0);
    expect(addonRepo.find).toHaveBeenCalledWith({ where: { active: true }, order: { id: 'ASC' } });
  });

  it('update merges only the provided fields, keeping the rest unchanged', async () => {
    repo.findOne.mockResolvedValue({
      id: 1,
      name: 'Coupe Femme',
      description: 'desc',
      category: 'coiffure',
      duration_minutes: 45,
      price_cents: 4500,
      active: true,
    });

    const result = await service.update(1, { priceCents: 5000 });

    expect(result.price_cents).toBe(5000);
    expect(result.name).toBe('Coupe Femme');
    expect(result.duration_minutes).toBe(45);
  });

  it('update throws NotFoundException for a missing service', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.update(999, { priceCents: 1000 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update replaces the addon list wholesale when addons are provided', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'Manucure Classique', price_cents: 2500, duration_minutes: 30, active: true });

    await service.update(1, {
      addons: [{ name: 'Nail Art', extraPriceCents: 1000, extraDurationMinutes: 15 }],
    });

    expect(manager.delete).toHaveBeenCalledWith(ServiceAddon, { service_id: 1 });
    expect(manager.insert).toHaveBeenCalledWith(
      ServiceAddon,
      [expect.objectContaining({ service_id: 1, name: 'Nail Art', extra_price_cents: 1000, extra_duration_minutes: 15 })],
    );
  });

  it('update does not touch addons when none are provided', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'Coupe Femme', price_cents: 4500, duration_minutes: 45, active: true });

    await service.update(1, { priceCents: 5000 });

    expect(manager.delete).not.toHaveBeenCalled();
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
