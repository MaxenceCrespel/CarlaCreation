import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminCalendarTokenController } from './admin-calendar-token.controller';
import { CalendarFeedController } from './calendar-feed.controller';
import { CalendarFeedService } from './calendar-feed.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminCalendarTokenController, CalendarFeedController],
  providers: [CalendarFeedService],
})
export class CalendarFeedModule {}
