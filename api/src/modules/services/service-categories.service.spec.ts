import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ServiceCategoriesService } from './service-categories.service';
import { ServiceCategory } from '../../database/entities/service-category.entity';
import { Service } from '../../database/entities/service.entity';

describe('ServiceCategoriesService', () => {
  let service: ServiceCategoriesService;
  let categoryRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let serviceRepo: { count: jest.Mock };

  beforeEach(async () => {
    categoryRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve({ id: 1, ...v })),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    serviceRepo = { count: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceCategoriesService,
        { provide: getRepositoryToken(ServiceCategory), useValue: categoryRepo },
        { provide: getRepositoryToken(Service), useValue: serviceRepo },
      ],
    }).compile();

    service = module.get(ServiceCategoriesService);
  });

  it('findAll orders by parent then sort_order then id', async () => {
    categoryRepo.find.mockResolvedValue([]);
    await service.findAll();
    expect(categoryRepo.find).toHaveBeenCalledWith({ order: { parent_id: 'ASC', sort_order: 'ASC', id: 'ASC' } });
  });

  it('create appends after the current max sort_order among top-level categories', async () => {
    const where = jest.fn().mockReturnThis();
    categoryRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where,
      getRawOne: jest.fn().mockResolvedValue({ max: 3 }),
    });

    await service.create({ name: 'Homme' });

    expect(where).toHaveBeenCalledWith('c.parent_id IS NULL', { parentId: null });
    expect(categoryRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Homme', sort_order: 4, parent_id: null }));
  });

  it('create starts at 0 when no categories exist yet', async () => {
    categoryRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: null }),
    });

    await service.create({ name: 'Homme' });

    expect(categoryRepo.save).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 0 }));
  });

  it('create as a subcategory validates the parent is top-level and scopes sort_order to siblings', async () => {
    categoryRepo.findOne.mockResolvedValue({ id: 1, name: 'Coiffure', sort_order: 0, parent_id: null });
    const where = jest.fn().mockReturnThis();
    categoryRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where,
      getRawOne: jest.fn().mockResolvedValue({ max: null }),
    });

    await service.create({ name: 'Hommes', parentId: 1 });

    expect(where).toHaveBeenCalledWith('c.parent_id = :parentId', { parentId: 1 });
    expect(categoryRepo.save).toHaveBeenCalledWith(expect.objectContaining({ parent_id: 1, sort_order: 0 }));
  });

  it('create rejects a missing parent category', async () => {
    categoryRepo.findOne.mockResolvedValue(null);
    await expect(service.create({ name: 'Hommes', parentId: 999 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create rejects nesting under a category that is already a subcategory', async () => {
    categoryRepo.findOne.mockResolvedValue({ id: 5, name: 'Hommes', sort_order: 0, parent_id: 1 });
    await expect(service.create({ name: 'X', parentId: 5 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update throws NotFoundException for a missing category', async () => {
    categoryRepo.findOne.mockResolvedValue(null);
    await expect(service.update(999, { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update merges only the provided fields', async () => {
    categoryRepo.findOne.mockResolvedValue({ id: 1, name: 'Coiffure', sort_order: 0, parent_id: null });
    const result = await service.update(1, { sortOrder: 5 });
    expect(result).toEqual({ id: 1, name: 'Coiffure', sort_order: 5, parent_id: null });
  });

  it('update rejects setting a category as its own parent', async () => {
    categoryRepo.findOne.mockResolvedValue({ id: 1, name: 'Coiffure', sort_order: 0, parent_id: null });
    await expect(service.update(1, { parentId: 1 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update rejects nesting a category that already has children', async () => {
    categoryRepo.findOne
      .mockResolvedValueOnce({ id: 1, name: 'Coiffure', sort_order: 0, parent_id: null }) // existing
      .mockResolvedValueOnce({ id: 2, name: 'Ongles', sort_order: 1, parent_id: null }); // target parent
    categoryRepo.count.mockResolvedValue(2); // category 1 already has children
    await expect(service.update(1, { parentId: 2 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update allows clearing parentId back to top-level with null', async () => {
    categoryRepo.findOne.mockResolvedValue({ id: 5, name: 'Hommes', sort_order: 0, parent_id: 1 });
    const result = await service.update(5, { parentId: null });
    expect(result.parent_id).toBeNull();
  });

  it('remove throws NotFoundException for a missing category', async () => {
    categoryRepo.findOne.mockResolvedValue(null);
    await expect(service.remove(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove rejects a category that still has subcategories', async () => {
    categoryRepo.findOne.mockResolvedValue({ id: 1, name: 'Coiffure', sort_order: 0, parent_id: null });
    categoryRepo.count.mockResolvedValue(1);
    await expect(service.remove(1)).rejects.toBeInstanceOf(ConflictException);
    expect(categoryRepo.delete).not.toHaveBeenCalled();
  });

  it('remove rejects a category that still has services attached', async () => {
    categoryRepo.findOne.mockResolvedValue({ id: 1, name: 'Coiffure', sort_order: 0, parent_id: null });
    categoryRepo.count.mockResolvedValue(0);
    serviceRepo.count.mockResolvedValue(3);
    await expect(service.remove(1)).rejects.toBeInstanceOf(ConflictException);
    expect(categoryRepo.delete).not.toHaveBeenCalled();
  });

  it('remove deletes an empty category', async () => {
    categoryRepo.findOne.mockResolvedValue({ id: 1, name: 'Coiffure', sort_order: 0, parent_id: null });
    categoryRepo.count.mockResolvedValue(0);
    serviceRepo.count.mockResolvedValue(0);
    await service.remove(1);
    expect(categoryRepo.delete).toHaveBeenCalledWith(1);
  });
});
