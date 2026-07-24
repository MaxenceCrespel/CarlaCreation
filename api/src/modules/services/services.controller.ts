import { Controller, Get } from '@nestjs/common';
import { ServicesService } from './services.service';

@Controller('api/services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  async findAll() {
    const services = await this.servicesService.findAllActive();
    return services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      duration_minutes: s.duration_minutes,
      price_cents: s.price_cents,
      addons: s.addons.map((a) => ({
        id: a.id,
        name: a.name,
        extra_price_cents: a.extra_price_cents,
        extra_duration_minutes: a.extra_duration_minutes,
      })),
    }));
  }
}
