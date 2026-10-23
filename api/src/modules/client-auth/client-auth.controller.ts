import { Body, Controller, Delete, Get, Header, HttpCode, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { config } from '../../config';
import { CsrfGuard } from '../../common/csrf';
import { ClientAuthGuard, ClientPayload } from '../../common/client-auth.guard';
import { ClientAuthService } from './client-auth.service';
import { AccountLifecycleService } from './account-lifecycle.service';
import { ClientLoginDto, DeleteAccountDto, EmailDto, RedeemRewardDto, ReferralCodeDto, ResetPasswordDto, SignupDto, TokenDto, UpdateClientProfileDto } from './dto/client-auth.dto';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: config.COOKIE_SECURE,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
};

@Controller('api/client-auth')
export class ClientAuthController {
  constructor(
    private readonly clientAuthService: ClientAuthService,
    private readonly lifecycle: AccountLifecycleService,
  ) {}

  // Same rate-limit rationale as the admin login — slows down credential
  // brute-forcing without meaningfully bothering a real client.
  @Throttle({ default: { limit: 20, ttl: 900_000 } })
  @UseGuards(CsrfGuard)
  @Post('signup')
  @HttpCode(200)
  async signup(@Body() dto: SignupDto) {
    const { client } = await this.clientAuthService.signup(dto);
    // No session yet — the account is usable once the emailed link is clicked.
    return { success: true, pendingVerification: true, email: client.email };
  }

  @Throttle({ default: { limit: 20, ttl: 900_000 } })
  @UseGuards(CsrfGuard)
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() dto: TokenDto, @Res({ passthrough: true }) res: Response) {
    const client = await this.lifecycle.verifyEmail(dto.token);
    res.cookie('client_session', this.clientAuthService.issueToken(client), COOKIE_OPTIONS);
    return { success: true, name: client.name };
  }

  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @UseGuards(CsrfGuard)
  @Post('resend-verification')
  @HttpCode(200)
  async resendVerification(@Body() dto: EmailDto) {
    await this.lifecycle.resendVerification(dto.email);
    return { success: true };
  }

  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @UseGuards(CsrfGuard)
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() dto: EmailDto) {
    await this.lifecycle.requestPasswordReset(dto.email);
    return { success: true };
  }

  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @UseGuards(CsrfGuard)
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.lifecycle.resetPassword(dto.token, dto.password);
    return { success: true };
  }

  @Throttle({ default: { limit: 20, ttl: 900_000 } })
  @UseGuards(CsrfGuard)
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: ClientLoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, client } = await this.clientAuthService.login(dto.email, dto.password);
    res.cookie('client_session', token, COOKIE_OPTIONS);
    return { success: true, name: client.name, email: client.email };
  }

  @UseGuards(CsrfGuard)
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('client_session', { path: '/' });
    return { success: true };
  }

  @UseGuards(ClientAuthGuard)
  @Get('me/export')
  @Header('Content-Disposition', 'attachment; filename="mes-donnees.json"')
  exportData(@Req() req: Request & { client?: ClientPayload }) {
    return this.lifecycle.exportData(req.client!.sub);
  }

  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @UseGuards(ClientAuthGuard, CsrfGuard)
  @Delete('me')
  @HttpCode(200)
  async deleteAccount(@Req() req: Request & { client?: ClientPayload }, @Body() dto: DeleteAccountDto, @Res({ passthrough: true }) res: Response) {
    await this.lifecycle.deleteOwnAccount(req.client!.sub, dto.password);
    res.clearCookie('client_session', { path: '/' });
    return { success: true };
  }

  @UseGuards(ClientAuthGuard)
  @Get('me')
  me(@Req() req: Request & { client?: ClientPayload }) {
    return this.clientAuthService.getProfile(req.client!.sub);
  }

  // Tight limit: this is a code-guessing oracle otherwise.
  @Throttle({ default: { limit: 8, ttl: 900_000 } })
  @UseGuards(ClientAuthGuard, CsrfGuard)
  @Post('me/referral')
  @HttpCode(200)
  async applyReferral(@Req() req: Request & { client?: ClientPayload }, @Body() dto: ReferralCodeDto) {
    await this.clientAuthService.applyReferralCode(req.client!.sub, dto.code);
    return { success: true };
  }

  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @UseGuards(ClientAuthGuard, CsrfGuard)
  @Post('me/redeem')
  @HttpCode(200)
  async redeem(@Req() req: Request & { client?: ClientPayload }, @Body() dto: RedeemRewardDto) {
    return { success: true, ...(await this.clientAuthService.redeemReward(req.client!.sub, dto.points)) };
  }

  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @UseGuards(ClientAuthGuard, CsrfGuard)
  @Patch('me')
  async updateProfile(
    @Req() req: Request & { client?: ClientPayload },
    @Body() dto: UpdateClientProfileDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, client } = await this.clientAuthService.updateProfile(req.client!.sub, dto);
    res.cookie('client_session', token, COOKIE_OPTIONS);
    return { success: true, name: client.name };
  }
}
