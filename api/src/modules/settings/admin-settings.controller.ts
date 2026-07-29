import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/admin-auth.guard';
import { CsrfGuard } from '../../common/csrf';
import { SettingsService } from './settings.service';
import { UpdateDailyHoursDto, UpdateTravelBufferDto, UpdateTravelFeeBaseDto, UpdateTravelFeePerKmDto } from './dto/settings.dto';

@UseGuards(AdminAuthGuard)
@Controller('api/admin/settings')
export class AdminSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('daily-hours')
  async getDailyHours() {
    return { days: await this.settingsService.getDailyHoursWindow() };
  }

  @UseGuards(CsrfGuard)
  @Put('daily-hours/:date')
  async setDailyHours(@Param('date') date: string, @Body() dto: UpdateDailyHoursDto) {
    await this.settingsService.setDailyHours(date, dto);
    return { success: true };
  }

  @UseGuards(CsrfGuard)
  @Delete('daily-hours/:date')
  async resetDailyHours(@Param('date') date: string) {
    await this.settingsService.resetDailyHours(date);
    return { success: true };
  }

  @Get('travel-buffer')
  async getTravelBuffer() {
    return { minutes: await this.settingsService.getTravelBufferMinutes() };
  }

  @UseGuards(CsrfGuard)
  @Put('travel-buffer')
  async setTravelBuffer(@Body() dto: UpdateTravelBufferDto) {
    await this.settingsService.setTravelBufferMinutes(dto.minutes);
    return { success: true };
  }

  @Get('travel-fee')
  async getTravelFee() {
    return {
      baseFeeCents: await this.settingsService.getTravelFeeBaseCents(),
      perKmCents: await this.settingsService.getTravelFeePerKmCents(),
    };
  }

  @UseGuards(CsrfGuard)
  @Put('travel-fee/base')
  async setTravelFeeBase(@Body() dto: UpdateTravelFeeBaseDto) {
    await this.settingsService.setTravelFeeBaseCents(dto.feeCents);
    return { success: true };
  }

  @UseGuards(CsrfGuard)
  @Put('travel-fee/per-km')
  async setTravelFeePerKm(@Body() dto: UpdateTravelFeePerKmDto) {
    await this.settingsService.setTravelFeePerKmCents(dto.feeCents);
    return { success: true };
  }
}
