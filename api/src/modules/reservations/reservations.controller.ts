import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CsrfGuard } from '../../common/csrf';
import { ReservationsService } from './reservations.service';
import { AvailabilityQueryDto, CreateReservationDto, NextAvailableQueryDto } from './dto/reservation.dto';

@Controller('api/reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get('availability')
  availability(@Query() query: AvailabilityQueryDto) {
    return this.reservationsService.getAvailability(query.date, query.serviceIds);
  }

  @Get('next-available')
  nextAvailable(@Query() query: NextAvailableQueryDto) {
    return this.reservationsService.findNextAvailable(query.serviceIds);
  }

  // Tighter limit specifically on booking creation to deter spam.
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @UseGuards(CsrfGuard)
  @Post()
  async create(@Body() dto: CreateReservationDto) {
    const reservation = await this.reservationsService.create(dto);
    return { success: true, reservation };
  }
}
