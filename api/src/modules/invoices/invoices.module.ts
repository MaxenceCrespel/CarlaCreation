import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Invoice } from '../../database/entities/invoice.entity';
import { InvoiceItem } from '../../database/entities/invoice-item.entity';
import { Reservation } from '../../database/entities/reservation.entity';
import { Service } from '../../database/entities/service.entity';
import { ReservationAddon } from '../../database/entities/reservation-addon.entity';
import { Promotion } from '../../database/entities/promotion.entity';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Invoice, InvoiceItem, Reservation, Service, ReservationAddon, Promotion])],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
