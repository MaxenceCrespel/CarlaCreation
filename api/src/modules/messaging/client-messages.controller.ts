import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ClientAuthGuard, ClientPayload } from '../../common/client-auth.guard';
import { CsrfGuard } from '../../common/csrf';
import { SendMessageDto } from './dto/message.dto';
import { MessagingService } from './messaging.service';
import { messagePhotoUpload } from './upload';

type ClientRequest = Request & { client?: ClientPayload };

// The logged-in client's side of the conversation (« Mon compte »).
@UseGuards(ClientAuthGuard)
@Controller('api/client-messages')
export class ClientMessagesController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  list(@Req() req: ClientRequest) {
    return this.messaging.listMessages(req.client!.sub);
  }

  @Get('unread-count')
  async unread(@Req() req: ClientRequest) {
    return { count: await this.messaging.unreadForClient(req.client!.sub) };
  }

  @UseGuards(CsrfGuard)
  @Post('read')
  @HttpCode(200)
  async read(@Req() req: ClientRequest) {
    await this.messaging.markRead(req.client!.sub, 'client');
    return { success: true };
  }

  @Throttle({ default: { limit: 30, ttl: 900_000 } })
  @UseGuards(CsrfGuard)
  @Post()
  @UseInterceptors(FileInterceptor('photo', messagePhotoUpload))
  send(@Req() req: ClientRequest, @Body() dto: SendMessageDto, @UploadedFile() photo?: Express.Multer.File) {
    return this.messaging.sendFromClient(req.client!.sub, dto.body, photo?.filename ?? null, dto.reservationId);
  }

  @Get('photo/:id')
  async photo(@Req() req: ClientRequest, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const file = await this.messaging.photoPath(id, req.client!.sub);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(file);
  }
}
