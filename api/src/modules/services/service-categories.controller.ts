import { Controller, Get } from '@nestjs/common';
import { ServiceCategoriesService } from './service-categories.service';

@Controller('api/service-categories')
export class ServiceCategoriesController {
  constructor(private readonly categoriesService: ServiceCategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }
}
