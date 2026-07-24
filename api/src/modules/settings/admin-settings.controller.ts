import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/admin-auth.guard';
import { CsrfGuard } from '../../common/csrf';
import { SettingsService } from './settings.service';
import { UpdateDailyHoursDto, UpdateTravelBufferDto, UpdateTravelFeeDto } from './dto/settings.dto';

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
    return { feeCents: await this.settingsService.getTravelFeeCents() };
  }

  @UseGuards(CsrfGuard)
  @Put('travel-fee')
  async setTravelFee(@Body() dto: UpdateTravelFeeDto) {
    await this.settingsService.setTravelFeeCents(dto.feeCents);
    return { success: true };
  }
}
