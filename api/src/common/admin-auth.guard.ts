import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface AdminPayload {
  sub: number;
  username: string;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { admin?: AdminPayload }>();
    const token: string | undefined = req.cookies?.admin_session;

    if (!token) {
      throw new UnauthorizedException('Authentification requise.');
    }

    try {
      const payload = this.jwtService.verify<{ sub: number; username: string }>(token);
      req.admin = { sub: payload.sub, username: payload.username };
      return true;
    } catch (err) {
      throw new UnauthorizedException('Session invalide ou expirée.');
    }
  }
}
