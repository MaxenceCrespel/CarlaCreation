import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AnalyticsService } from './analytics.service';
import { TrackController } from './track.controller';

@Module({
  imports: [AuthModule],
  controllers: [TrackController, AdminAnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
