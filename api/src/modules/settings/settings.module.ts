import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HoursController } from './hours.controller';
import { AdminSettingsController } from './admin-settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [AuthModule],
  controllers: [HoursController, AdminSettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
