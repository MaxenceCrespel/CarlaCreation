import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { config } from '../../config';
import { CsrfGuard } from '../../common/csrf';
import { ClientAuthGuard, ClientPayload } from '../../common/client-auth.guard';
import { ClientAuthService } from './client-auth.service';
import { ClientLoginDto, SignupDto, UpdateClientProfileDto } from './dto/client-auth.dto';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: config.COOKIE_SECURE,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
};

@Controller('api/client-auth')
export class ClientAuthController {
  constructor(private readonly clientAuthService: ClientAuthService) {}

  // Same rate-limit rationale as the admin login — slows down credential
  // brute-forcing without meaningfully bothering a real client.
  @Throttle({ default: { limit: 20, ttl: 900_000 } })
  @UseGuards(CsrfGuard)
  @Post('signup')
  @HttpCode(200)
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const { token, client } = await this.clientAuthService.signup(dto);
    res.cookie('client_session', token, COOKIE_OPTIONS);
    return { success: true, name: client.name, email: client.email };
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
  @Get('me')
  me(@Req() req: Request & { client?: ClientPayload }) {
    return this.clientAuthService.getProfile(req.client!.sub);
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
