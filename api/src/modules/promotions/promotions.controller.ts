import { Controller, Get, Param, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { extractOptionalClient } from '../../common/client-auth.guard';
import { PromotionsService } from './promotions.service';

// Public, unauthenticated — powers the booking page's "tarif spécial"
// dropdown and its "code promo" field.
@Controller('api/promotions')
export class PromotionsController {
  constructor(
    private readonly promotionsService: PromotionsService,
    private readonly jwtService: JwtService,
  ) {}

  @Get('selectable')
  findSelectable() {
    return this.promotionsService.findSelectable();
  }

  @Get('by-code/:code')
  findByCode(@Param('code') code: string, @Req() req: Request) {
    const client = extractOptionalClient(req, this.jwtService);
    return this.promotionsService.findByCode(code, client?.sub ?? null);
  }
}
