import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PushModule } from '../push/push.module';
import { AdminContactController } from './admin-contact.controller';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

@Module({
  imports: [AuthModule, PushModule],
  controllers: [ContactController, AdminContactController],
  providers: [ContactService],
})
export class ContactModule {}
