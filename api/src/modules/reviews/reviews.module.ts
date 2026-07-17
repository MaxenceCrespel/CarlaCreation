import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReviewsController } from './reviews.controller';
import { AdminReviewsController } from './admin-reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [AuthModule],
  controllers: [ReviewsController, AdminReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
