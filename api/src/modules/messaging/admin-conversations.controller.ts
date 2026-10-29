import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AdminAuthGuard } from '../../common/admin-auth.guard';
import { CsrfGuard } from '../../common/csrf';
import { SendMessageDto } from './dto/message.dto';
import { MessagingService } from './messaging.service';
import { messagePhotoUpload } from './upload';

// Carla's side: every conversation, one thread per client.
@UseGuards(AdminAuthGuard)
@Controller('api/admin/conversations')
export class AdminConversationsController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  list() {
    return this.messaging.listConversations();
  }

  @Get('photo/:messageId')
  async photo(@Param('messageId', ParseIntPipe) messageId: number, @Res() res: Response) {
    const file = await this.messaging.photoPath(messageId);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(file);
  }

  @Get(':clientId')
  get(@Param('clientId', ParseIntPipe) clientId: number) {
    return this.messaging.getConversation(clientId);
  }

  @UseGuards(CsrfGuard)
  @Post(':clientId/read')
  @HttpCode(200)
  async read(@Param('clientId', ParseIntPipe) clientId: number) {
    await this.messaging.markRead(clientId, 'admin');
    return { success: true };
  }

  @UseGuards(CsrfGuard)
  @Post(':clientId')
  @UseInterceptors(FileInterceptor('photo', messagePhotoUpload))
  send(@Param('clientId', ParseIntPipe) clientId: number, @Body() dto: SendMessageDto, @UploadedFile() photo?: Express.Multer.File) {
    return this.messaging.sendFromAdmin(clientId, dto.body, photo?.filename ?? null);
  }

  @UseGuards(CsrfGuard)
  @Delete('messages/:id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.messaging.removeMessage(id);
    return { success: true };
  }
}
