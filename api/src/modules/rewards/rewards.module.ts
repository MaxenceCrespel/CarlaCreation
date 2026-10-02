import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../../database/entities/client.entity';
import { SettingsModule } from '../settings/settings.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { RewardsService } from './rewards.service';

@Module({
  imports: [TypeOrmModule.forFeature([Client]), SettingsModule, PromotionsModule],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
