import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { config } from '../../config';
import { CsrfGuard } from '../../common/csrf';
import { AdminAuthGuard, AdminPayload } from '../../common/admin-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Strict rate limiting on login to slow down credential brute-forcing.
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @UseGuards(CsrfGuard)
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, username } = await this.authService.login(dto.username, dto.password);

    res.cookie('admin_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.COOKIE_SECURE,
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });

    return { success: true, username };
  }

  @UseGuards(CsrfGuard)
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('admin_session', { path: '/' });
    return { success: true };
  }

  @UseGuards(AdminAuthGuard)
  @Get('me')
  me(@Req() req: Request & { admin?: AdminPayload }) {
    return { username: req.admin?.username };
  }
}
