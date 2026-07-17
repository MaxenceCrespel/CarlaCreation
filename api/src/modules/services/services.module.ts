import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ServicesController } from './services.controller';
import { AdminServicesController } from './admin-services.controller';
import { ServicesService } from './services.service';

@Module({
  imports: [AuthModule],
  controllers: [ServicesController, AdminServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
