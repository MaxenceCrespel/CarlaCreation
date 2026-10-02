import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/admin-auth.guard';
import { CsrfGuard } from '../../common/csrf';
import { SettingsService } from './settings.service';
import {
  UpdateBirthdayDiscountDto,
  UpdateDailyHoursDto,
  UpdateLoyaltyDiscountDto,
  UpdateLoyaltyVisitsDto,
  UpdateRefundDeadlineDto,
  UpdateTravelBufferDto,
  UpdateTravelFeeFallbackDto,
  UpdateTravelFeeTiersDto,
} from './dto/settings.dto';
import { config } from '../../config';

@UseGuards(AdminAuthGuard)
@Controller('api/admin/settings')
export class AdminSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('daily-hours')
  async getDailyHours() {
    return { days: await this.settingsService.getDailyHoursWindow() };
  }

  @UseGuards(CsrfGuard)
  @Put('daily-hours/:date')
  async setDailyHours(@Param('date') date: string, @Body() dto: UpdateDailyHoursDto) {
    await this.settingsService.setDailyHours(date, dto);
    return { success: true };
  }

  @UseGuards(CsrfGuard)
  @Delete('daily-hours/:date')
  async resetDailyHours(@Param('date') date: string) {
    await this.settingsService.resetDailyHours(date);
    return { success: true };
  }

  @Get('travel-buffer')
  async getTravelBuffer() {
    return { minutes: await this.settingsService.getTravelBufferMinutes() };
  }

  @UseGuards(CsrfGuard)
  @Put('travel-buffer')
  async setTravelBuffer(@Body() dto: UpdateTravelBufferDto) {
    await this.settingsService.setTravelBufferMinutes(dto.minutes);
    return { success: true };
  }

  @Get('travel-fee')
  async getTravelFee() {
    return {
      fallbackCents: await this.settingsService.getTravelFeeFallbackCents(),
      tiers: await this.settingsService.getTravelFeeTiers(),
    };
  }

  @UseGuards(CsrfGuard)
  @Put('travel-fee/fallback')
  async setTravelFeeFallback(@Body() dto: UpdateTravelFeeFallbackDto) {
    await this.settingsService.setTravelFeeFallbackCents(dto.feeCents);
    return { success: true };
  }

  @UseGuards(CsrfGuard)
  @Put('travel-fee/tiers')
  async setTravelFeeTiers(@Body() dto: UpdateTravelFeeTiersDto) {
    await this.settingsService.setTravelFeeTiers(dto.tiers);
    return { success: true };
  }

  @Get('payments')
  async getPaymentSettings() {
    return {
      stripeEnabled: config.STRIPE_ENABLED,
      refundDeadlineHours: await this.settingsService.getRefundDeadlineHours(),
    };
  }

  @UseGuards(CsrfGuard)
  @Put('payments/refund-deadline')
  async setRefundDeadline(@Body() dto: UpdateRefundDeadlineDto) {
    await this.settingsService.setRefundDeadlineHours(dto.hours);
    return { success: true };
  }

  @Get('loyalty')
  async getLoyalty() {
    return {
      visitsRequired: await this.settingsService.getLoyaltyVisitsRequired(),
      loyaltyDiscountPercent: await this.settingsService.getLoyaltyDiscountPercent(),
      birthdayDiscountPercent: await this.settingsService.getBirthdayDiscountPercent(),
    };
  }

  @UseGuards(CsrfGuard)
  @Put('loyalty/visits-required')
  async setLoyaltyVisits(@Body() dto: UpdateLoyaltyVisitsDto) {
    await this.settingsService.setLoyaltyVisitsRequired(dto.visits);
    return { success: true };
  }

  @UseGuards(CsrfGuard)
  @Put('loyalty/discount-percent')
  async setLoyaltyDiscount(@Body() dto: UpdateLoyaltyDiscountDto) {
    await this.settingsService.setLoyaltyDiscountPercent(dto.percent);
    return { success: true };
  }

  @UseGuards(CsrfGuard)
  @Put('loyalty/birthday-discount-percent')
  async setBirthdayDiscount(@Body() dto: UpdateBirthdayDiscountDto) {
    await this.settingsService.setBirthdayDiscountPercent(dto.percent);
    return { success: true };
  }
}
