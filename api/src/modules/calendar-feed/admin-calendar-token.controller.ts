import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthGuard, AdminPayload } from '../../common/admin-auth.guard';
import { CsrfGuard } from '../../common/csrf';
import { config } from '../../config';
import { CalendarFeedService } from './calendar-feed.service';

function toUrl(token: string | null): string | null {
  return token ? `${config.PUBLIC_ORIGIN}/api/calendar/${token}.ics` : null;
}

@UseGuards(AdminAuthGuard)
@Controller('api/admin/calendar-token')
export class AdminCalendarTokenController {
  constructor(private readonly calendarFeedService: CalendarFeedService) {}

  @Get()
  async get(@Req() req: Request & { admin?: AdminPayload }) {
    const token = await this.calendarFeedService.getToken(req.admin!.sub);
    return { token, url: toUrl(token) };
  }

  // Same action for the first-ever generation and for rotating an already
  // shared link (e.g. it leaked, or she's re-subscribing on a new device
  // and wants a clean link) — always issues a brand new token.
  @UseGuards(CsrfGuard)
  @Post()
  async regenerate(@Req() req: Request & { admin?: AdminPayload }) {
    const token = await this.calendarFeedService.regenerateToken(req.admin!.sub);
    return { token, url: toUrl(token) };
  }
}
