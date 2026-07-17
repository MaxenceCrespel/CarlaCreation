import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CsrfGuard } from '../../common/csrf';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/review.dto';

@Controller('api/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  async findApproved() {
    const { average, count, reviews } = await this.reviewsService.findApprovedWithSummary();
    return {
      average,
      count,
      reviews: reviews.map((r) => ({
        id: r.id,
        clientName: r.client_name,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.created_at,
      })),
    };
  }

  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @UseGuards(CsrfGuard)
  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateReviewDto) {
    await this.reviewsService.create(dto);
    return { success: true };
  }
}
