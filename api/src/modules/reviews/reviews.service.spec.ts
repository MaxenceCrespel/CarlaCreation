import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { Review } from '../../database/entities/review.entity';

describe('ReviewsService', () => {
  let service: ReviewsService;
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
      save: jest.fn((v) => Promise.resolve(v)),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewsService, { provide: getRepositoryToken(Review), useValue: repo }],
    }).compile();

    service = module.get(ReviewsService);
  });

  it('computes the average rating rounded to one decimal', async () => {
    repo.find.mockResolvedValue([]);
    repo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ count: '3', total: '14' }),
    });

    const { average, count } = await service.findApprovedWithSummary();

    expect(count).toBe(3);
    expect(average).toBeCloseTo(4.7, 1);
  });

  it('returns a null average when there are no approved reviews', async () => {
    repo.find.mockResolvedValue([]);
    repo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ count: '0', total: '0' }),
    });

    const { average, count } = await service.findApprovedWithSummary();

    expect(count).toBe(0);
    expect(average).toBeNull();
  });

  it('create always forces a new review to pending, regardless of input', async () => {
    await service.create({ clientName: 'Test', rating: 5, comment: 'Great!' } as any);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ client_name: 'Test', rating: 5, comment: 'Great!', status: 'pending' }),
    );
  });

  it('updateStatus throws NotFoundException for a missing review', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.updateStatus(999, 'approved')).rejects.toBeInstanceOf(NotFoundException);
  });
});
