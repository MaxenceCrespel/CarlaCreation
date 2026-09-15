import * as crypto from 'crypto';
import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { config } from '../../config';
import { CsrfGuard } from '../../common/csrf';
import { AnalyticsService, classifyDevice, classifySource } from './analytics.service';
import { TrackPageViewDto } from './dto/track.dto';

const VISITOR_COOKIE = 'visitor_id';
// 13 months — the CNIL's own guideline for an audience-measurement cookie
// exempt from consent (strictly first-party, no cross-site use, no profile
// beyond these aggregate stats).
const VISITOR_COOKIE_MAX_AGE = 396 * 24 * 60 * 60 * 1000;

@Controller('api')
export class TrackController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @UseGuards(CsrfGuard)
  @Post('track')
  @HttpCode(204)
  async track(@Body() dto: TrackPageViewDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    let visitorId = req.cookies?.[VISITOR_COOKIE];
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      res.cookie(VISITOR_COOKIE, visitorId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.COOKIE_SECURE,
        maxAge: VISITOR_COOKIE_MAX_AGE,
        path: '/',
      });
    }

    const source = classifySource(req.get('referer') ?? undefined, config.PUBLIC_ORIGIN);
    const device = classifyDevice(req.get('user-agent') ?? undefined);
    await this.analyticsService.record(dto.path, visitorId, source, device);
  }
}
