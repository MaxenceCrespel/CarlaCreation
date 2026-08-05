import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

@Module({
  imports: [PushModule],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
