import { Controller, Get, Param } from '@nestjs/common';
import { PromotionsService } from './promotions.service';

// Public, unauthenticated — powers the booking page's "tarif spécial"
// dropdown and its "code promo" field.
@Controller('api/promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get('selectable')
  findSelectable() {
    return this.promotionsService.findSelectable();
  }

  @Get('by-code/:code')
  findByCode(@Param('code') code: string) {
    return this.promotionsService.findByCode(code);
  }
}
