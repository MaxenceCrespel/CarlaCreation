import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { CsrfGuard } from '../../common/csrf';
import { extractOptionalClient } from '../../common/client-auth.guard';
import { ReservationsService } from './reservations.service';
import { AvailabilityQueryDto, CancelReservationDto, CreateReservationDto, DayAvailabilityQueryDto, NextAvailableQueryDto, TravelEstimateQueryDto } from './dto/reservation.dto';

@Controller('api/reservations')
export class ReservationsController {
  constructor(
    private readonly reservationsService: ReservationsService,
    private readonly jwtService: JwtService,
  ) {}

  @Get('availability')
  availability(@Query() query: AvailabilityQueryDto) {
    return this.reservationsService.getAvailability(query.date, query.serviceIds, query.atClientHome ?? false, query.addonMinutes ?? 0, query.address);
  }

  @Get('next-available')
  nextAvailable(@Query() query: NextAvailableQueryDto) {
    return this.reservationsService.findNextAvailable(query.serviceIds, query.atClientHome ?? false, query.addonMinutes ?? 0, query.address);
  }

  // Powers the "Complet" label on the day picker.
  @Get('day-availability')
  dayAvailability(@Query() query: DayAvailabilityQueryDto) {
    return this.reservationsService.getDayAvailability(query.serviceIds, query.atClientHome ?? false, query.addonMinutes ?? 0, query.address, query.days ?? 30);
  }

  // Live distance/duration/fee preview while the client types their
  // address on the à-domicile step — hits an external geocoding API, so
  // throttled tighter than a normal read endpoint.
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @Get('travel-estimate')
  travelEstimate(@Query() query: TravelEstimateQueryDto) {
    return this.reservationsService.estimateTravel(query.address);
  }

  // Tighter limit specifically on booking creation to deter spam.
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @UseGuards(CsrfGuard)
  @Post()
  async create(@Body() dto: CreateReservationDto, @Req() req: Request) {
    // Booking stays guest-friendly either way — a logged-in client just
    // gets their own row auto-linked (see ReservationsService.create), no
    // separate "book as me" step needed.
    const client = extractOptionalClient(req, this.jwtService);
    const reservation = await this.reservationsService.create(dto, client?.sub ?? null);
    return { success: true, reservation };
  }

  // "Manage my booking" link sent in confirmation emails — group_id itself
  // is the unguessable access token, no login needed.
  @Get('lookup/:groupId')
  lookup(@Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.reservationsService.findByGroupId(groupId);
  }

  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @UseGuards(CsrfGuard)
  @Post('lookup/:groupId/cancel')
  async cancel(@Param('groupId', ParseUUIDPipe) groupId: string, @Body() dto: CancelReservationDto) {
    await this.reservationsService.cancelByGroupId(groupId, dto.reason);
    return { success: true };
  }
}
