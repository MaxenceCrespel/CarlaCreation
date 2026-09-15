import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/admin-auth.guard';
import { AnalyticsService, VisitorPeriod } from './analytics.service';

const VALID_PERIODS: VisitorPeriod[] = ['w1', 'm1', 'm3'];

@UseGuards(AdminAuthGuard)
@Controller('api/admin/visitors')
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  getStats(@Query('period') period = 'm1') {
    if (!VALID_PERIODS.includes(period as VisitorPeriod)) {
      throw new BadRequestException('Période invalide.');
    }
    return this.analyticsService.getStats(period as VisitorPeriod);
  }
}
