import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ServicesController } from './services.controller';
import { AdminServicesController } from './admin-services.controller';
import { ServicesService } from './services.service';
import { ServiceCategoriesController } from './service-categories.controller';
import { AdminServiceCategoriesController } from './admin-service-categories.controller';
import { ServiceCategoriesService } from './service-categories.service';

@Module({
  imports: [AuthModule],
  controllers: [ServicesController, AdminServicesController, ServiceCategoriesController, AdminServiceCategoriesController],
  providers: [ServicesService, ServiceCategoriesService],
  exports: [ServicesService],
})
export class ServicesModule {}
