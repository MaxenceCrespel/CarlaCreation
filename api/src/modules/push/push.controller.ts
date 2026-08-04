import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthGuard, AdminPayload } from '../../common/admin-auth.guard';
import { CsrfGuard } from '../../common/csrf';
import { PushService } from './push.service';
import { SubscribePushDto, UnsubscribePushDto } from './dto/push.dto';

@UseGuards(AdminAuthGuard)
@Controller('api/admin/push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('public-key')
  getPublicKey() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Get('status')
  async status(@Query('endpoint') endpoint: string, @Req() req: Request & { admin?: AdminPayload }) {
    if (!endpoint) return { subscribed: false };
    return { subscribed: await this.pushService.isSubscribed(req.admin!.sub, endpoint) };
  }

  @UseGuards(CsrfGuard)
  @Post('subscribe')
  async subscribe(@Body() dto: SubscribePushDto, @Req() req: Request & { admin?: AdminPayload }) {
    await this.pushService.subscribe(req.admin!.sub, dto);
    return { success: true };
  }

  @UseGuards(CsrfGuard)
  @Post('unsubscribe')
  async unsubscribe(@Body() dto: UnsubscribePushDto, @Req() req: Request & { admin?: AdminPayload }) {
    await this.pushService.unsubscribe(req.admin!.sub, dto.endpoint);
    return { success: true };
  }

  // Lets the admin confirm notifications actually work on this device right
  // after enabling them, instead of waiting for a real booking to test it.
  @UseGuards(CsrfGuard)
  @Post('test')
  async test() {
    await this.pushService.notifyAdmins({ title: 'Carla Création', body: 'Les notifications fonctionnent.' });
    return { success: true };
  }
}
