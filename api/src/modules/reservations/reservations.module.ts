import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';
import { DistanceModule } from '../distance/distance.module';
import { PushModule } from '../push/push.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { StripeModule } from '../stripe/stripe.module';
import { RewardsModule } from '../rewards/rewards.module';
import { ClientAuthModule } from '../client-auth/client-auth.module';
import { ReservationsController } from './reservations.controller';
import { AdminReservationsController } from './admin-reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [AuthModule, SettingsModule, DistanceModule, PushModule, PromotionsModule, StripeModule, RewardsModule, ClientAuthModule],
  controllers: [ReservationsController, AdminReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}
