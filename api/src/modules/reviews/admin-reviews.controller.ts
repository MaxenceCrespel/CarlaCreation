import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/admin-auth.guard';
import { CsrfGuard } from '../../common/csrf';
import { ReviewsService } from './reviews.service';
import { UpdateReviewStatusDto } from './dto/review.dto';

@UseGuards(AdminAuthGuard)
@Controller('api/admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  async findAll() {
    const reviews = await this.reviewsService.findAll();
    return reviews.map((r) => ({
      id: r.id,
      clientName: r.client_name,
      rating: r.rating,
      comment: r.comment,
      status: r.status,
      createdAt: r.created_at,
    }));
  }

  @UseGuards(CsrfGuard)
  @Patch(':id/status')
  async updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReviewStatusDto) {
    const r = await this.reviewsService.updateStatus(id, dto.status);
    return { id: r.id, clientName: r.client_name, rating: r.rating, comment: r.comment, status: r.status, createdAt: r.created_at };
  }

  @UseGuards(CsrfGuard)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.reviewsService.remove(id);
    return { success: true };
  }
}
