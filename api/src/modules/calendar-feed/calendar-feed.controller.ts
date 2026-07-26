import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CalendarFeedService } from './calendar-feed.service';

// Public/unauthenticated by design — a calendar app's background refresh
// can't carry a session cookie, so the unguessable token in the URL itself
// is the auth (see CalendarFeedService.regenerateToken).
@Controller('api/calendar')
export class CalendarFeedController {
  constructor(private readonly calendarFeedService: CalendarFeedService) {}

  @Get(':filename')
  async getFeed(@Param('filename') filename: string, @Res() res: Response): Promise<void> {
    if (!filename.endsWith('.ics')) {
      throw new NotFoundException();
    }
    const token = filename.slice(0, -'.ics'.length);
    const ics = await this.calendarFeedService.buildIcs(token);
    if (!ics) {
      throw new NotFoundException();
    }

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="carla-creation.ics"');
    res.send(ics);
  }
}
