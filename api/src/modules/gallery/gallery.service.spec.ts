import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { GalleryService } from './gallery.service';
import { Gallery } from '../../database/entities/gallery.entity';

jest.mock('fs', () => ({ unlink: jest.fn((_path, cb) => cb()) }));

describe('GalleryService', () => {
  let service: GalleryService;
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve({ id: 1, ...v })),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [GalleryService, { provide: getRepositoryToken(Gallery), useValue: repo }],
    }).compile();

    service = module.get(GalleryService);
    jest.clearAllMocks();
  });

  it('addUpload places the new photo one past the current max sort_order', async () => {
    repo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: 3 }),
    });
    repo.create.mockImplementation((v) => v);
    repo.save.mockImplementation((v) => Promise.resolve({ id: 4, ...v }));

    const result = await service.addUpload('photo.jpg', 'Alt text');

    expect(result.sort_order).toBe(4);
    expect(result.url).toBe('uploads/photo.jpg');
    expect(result.is_upload).toBe(true);
  });

  it('addUpload defaults sort_order to 1 when the gallery is empty', async () => {
    repo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: 0 }),
    });

    const result = await service.addUpload('first.jpg', 'First');
    expect(result.sort_order).toBe(1);
  });

  it('remove throws NotFoundException for a missing photo', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.remove(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove deletes the local file only when is_upload is true', async () => {
    repo.findOne.mockResolvedValue({ id: 1, url: 'uploads/x.jpg', is_upload: true });
    repo.delete.mockResolvedValue({ affected: 1 });

    await service.remove(1);

    expect(fs.unlink).toHaveBeenCalled();
  });

  it('remove does not attempt to delete a file for a non-upload (placeholder) entry', async () => {
    repo.findOne.mockResolvedValue({ id: 1, url: 'images/placeholder-1.svg', is_upload: false });
    repo.delete.mockResolvedValue({ affected: 1 });

    await service.remove(1);

    expect(fs.unlink).not.toHaveBeenCalled();
  });
});
