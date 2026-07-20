import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';
import { ReservationsController } from './reservations.controller';
import { AdminReservationsController } from './admin-reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [AuthModule, SettingsModule],
  controllers: [ReservationsController, AdminReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}
