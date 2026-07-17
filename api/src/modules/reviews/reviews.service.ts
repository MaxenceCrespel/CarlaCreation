import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../../database/entities/review.entity';
import type { ReviewStatus } from '../../database/entities/review.entity';
import { CreateReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(@InjectRepository(Review) private readonly reviewRepo: Repository<Review>) {}

  async findApprovedWithSummary(): Promise<{ average: number | null; count: number; reviews: Review[] }> {
    const reviews = await this.reviewRepo.find({
      where: { status: 'approved' },
      order: { created_at: 'DESC' },
      take: 20,
    });
    const raw = await this.reviewRepo
      .createQueryBuilder('review')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(review.rating), 0)', 'total')
      .where('review.status = :status', { status: 'approved' })
      .getRawOne<{ count: string; total: string }>();

    const countNum = Number(raw?.count ?? 0);
    const totalNum = Number(raw?.total ?? 0);

    return {
      average: countNum > 0 ? Math.round((totalNum / countNum) * 10) / 10 : null,
      count: countNum,
      reviews,
    };
  }

  async create(dto: CreateReviewDto): Promise<void> {
    const review = this.reviewRepo.create({
      client_name: dto.clientName,
      rating: dto.rating,
      comment: dto.comment,
      status: 'pending',
    });
    await this.reviewRepo.save(review);
  }

  findAll(): Promise<Review[]> {
    return this.reviewRepo.find({ order: { created_at: 'DESC' } });
  }

  async updateStatus(id: number, status: ReviewStatus): Promise<Review> {
    const item = await this.reviewRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Avis introuvable.');

    item.status = status;
    return this.reviewRepo.save(item);
  }

  async remove(id: number): Promise<void> {
    const result = await this.reviewRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Avis introuvable.');
  }
}
