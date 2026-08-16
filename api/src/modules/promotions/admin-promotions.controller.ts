import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/admin-auth.guard';
import { CsrfGuard } from '../../common/csrf';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';

@UseGuards(AdminAuthGuard)
@Controller('api/admin/promotions')
export class AdminPromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  findAll() {
    return this.promotionsService.findAll();
  }

  @UseGuards(CsrfGuard)
  @Post()
  create(@Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(dto);
  }

  @UseGuards(CsrfGuard)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePromotionDto) {
    return this.promotionsService.update(id, dto);
  }

  @UseGuards(CsrfGuard)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.promotionsService.remove(id);
    return { success: true };
  }
}
