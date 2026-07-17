import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/admin-auth.guard';
import { CsrfGuard } from '../../common/csrf';
import { SettingsService } from './settings.service';
import { UpdateDailyHoursDto } from './dto/settings.dto';

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
}
