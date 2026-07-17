import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ServicesService } from './services.service';
import { Service } from '../../database/entities/service.entity';

describe('ServicesService', () => {
  let service: ServicesService;
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve(v)),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ServicesService, { provide: getRepositoryToken(Service), useValue: repo }],
    }).compile();

    service = module.get(ServicesService);
  });

  it('findAllActive only queries active services, ordered by category then id', async () => {
    repo.find.mockResolvedValue([]);
    await service.findAllActive();
    expect(repo.find).toHaveBeenCalledWith({ where: { active: true }, order: { category: 'ASC', id: 'ASC' } });
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

  it('remove throws NotFoundException when nothing was deleted', async () => {
    repo.delete.mockResolvedValue({ affected: 0 });
    await expect(service.remove(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove succeeds silently when a row was deleted', async () => {
    repo.delete.mockResolvedValue({ affected: 1 });
    await expect(service.remove(1)).resolves.toBeUndefined();
  });
});
