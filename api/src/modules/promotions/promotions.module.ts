import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Promotion } from '../../database/entities/promotion.entity';
import { PromotionsController } from './promotions.controller';
import { AdminPromotionsController } from './admin-promotions.controller';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Promotion])],
  controllers: [PromotionsController, AdminPromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
