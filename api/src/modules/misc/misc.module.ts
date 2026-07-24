import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { MiscController } from './misc.controller';

@Module({
  imports: [SettingsModule],
  controllers: [MiscController],
})
export class MiscModule {}
