import { Controller, Get } from '@nestjs/common';
import { SettingsService } from './settings.service';

// Public, read-only day-by-day schedule for the upcoming window — used by
// the booking page to show hours before availability is fetched.
@Controller('api/hours')
export class HoursController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getHours() {
    return { days: await this.settingsService.getDailyHoursWindow() };
  }
}
