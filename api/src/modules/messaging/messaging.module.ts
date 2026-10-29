import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { PushModule } from '../push/push.module';
import { AdminConversationsController } from './admin-conversations.controller';
import { ClientMessagesController } from './client-messages.controller';
import { MessagingService } from './messaging.service';

@Module({
  imports: [AuthModule, ClientAuthModule, PushModule],
  controllers: [ClientMessagesController, AdminConversationsController],
  providers: [MessagingService],
})
export class MessagingModule {}
