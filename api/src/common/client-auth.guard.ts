import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface ClientPayload {
  sub: number;
  email: string;
}

// Mirrors AdminAuthGuard exactly, but reads the 'client_session' cookie and
// is a completely separate trust boundary — a client's JWT must never be
// accepted on an admin-only route, or vice versa (different cookie names,
// different guards, no shared payload shape).
@Injectable()
export class ClientAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { client?: ClientPayload }>();
    const token: string | undefined = req.cookies?.client_session;

    if (!token) {
      throw new UnauthorizedException('Connexion requise.');
    }

    try {
      const payload = this.jwtService.verify<ClientPayload & { role?: string }>(token);
      if (payload.role !== 'client') throw new Error('not a client token');
      req.client = { sub: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException('Session invalide ou expirée.');
    }
  }
}

// For routes that stay open to guests but should auto-link the booking to
// an already-logged-in client when the cookie happens to be present — see
// ReservationsController.create. Never throws: an absent/expired/forged
// cookie just means "not logged in", same as no cookie at all.
export function extractOptionalClient(req: Request, jwtService: JwtService): ClientPayload | null {
  const token = req.cookies?.client_session;
  if (!token) return null;
  try {
    const payload = jwtService.verify<ClientPayload & { role?: string }>(token);
    if (payload.role !== 'client') return null;
    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
