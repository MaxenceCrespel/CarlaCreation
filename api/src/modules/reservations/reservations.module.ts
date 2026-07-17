import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReservationsController } from './reservations.controller';
import { AdminReservationsController } from './admin-reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [AuthModule],
  controllers: [ReservationsController, AdminReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}
