import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Client } from '../../database/entities/client.entity';
import { Reservation } from '../../database/entities/reservation.entity';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Client, Reservation])],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
