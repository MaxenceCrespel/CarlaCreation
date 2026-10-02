import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/admin-auth.guard';
import { CsrfGuard } from '../../common/csrf';
import { ReservationsService } from './reservations.service';
import { AdminCreateReservationDto, SetPaidOnSiteDto, UpdateReservationDto, UpdateReservationStatusDto } from './dto/reservation.dto';

@UseGuards(AdminAuthGuard)
@Controller('api/reservations')
export class AdminReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  findAll() {
    return this.reservationsService.findAllForAdmin();
  }

  @UseGuards(CsrfGuard)
  @Post('manual')
  async createManual(@Body() dto: AdminCreateReservationDto) {
    const reservation = await this.reservationsService.createManual(dto);
    return { success: true, reservation };
  }

  // Bulk actions on a whole booking group (e.g. a mother + daughter request)
  // — registered before the single-id routes below so "group" isn't parsed
  // as a numeric :id.
  @UseGuards(CsrfGuard)
  @Patch('group/:groupId/status')
  async updateGroupStatus(@Param('groupId') groupId: string, @Body() dto: UpdateReservationStatusDto) {
    await this.reservationsService.updateGroupStatus(groupId, dto.status);
    return { success: true };
  }

  @UseGuards(CsrfGuard)
  @Delete('group/:groupId')
  async removeGroup(@Param('groupId') groupId: string) {
    await this.reservationsService.removeGroup(groupId);
    return { success: true };
  }

  // Purely a bookkeeping toggle for "payer sur place" bookings — no Stripe
  // involved, see Reservation.paid_on_site. Carla flips it once she's
  // actually been paid (cash, or the SumUp app's own Tap to Pay on her
  // phone, neither integrated here).
  @UseGuards(CsrfGuard)
  @Patch('group/:groupId/paid-on-site')
  async setPaidOnSite(@Param('groupId') groupId: string, @Body() dto: SetPaidOnSiteDto) {
    await this.reservationsService.setPaidOnSite(groupId, dto.paid);
    return { success: true };
  }

  @UseGuards(CsrfGuard)
  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReservationDto) {
    await this.reservationsService.updateReservation(id, dto);
    return { success: true };
  }

  @UseGuards(CsrfGuard)
  @Patch(':id/status')
  async updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReservationStatusDto) {
    await this.reservationsService.updateStatus(id, dto.status);
    return { success: true };
  }

  @UseGuards(CsrfGuard)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.reservationsService.remove(id);
    return { success: true };
  }
}
