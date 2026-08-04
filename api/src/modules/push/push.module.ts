import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PushSubscription } from '../../database/entities/push-subscription.entity';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([PushSubscription])],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
