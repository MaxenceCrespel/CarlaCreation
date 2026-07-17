import * as crypto from 'crypto';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

// Double-submit cookie CSRF protection: a readable (non-httpOnly) cookie
// holds a random token; the frontend must echo it back in a custom header
// on every state-changing request. A cross-site page cannot read the
// cookie (browser same-origin policy) nor set a custom header on a simple
// form post, so it cannot forge a valid pair.
export function issueCsrfToken(req: Request, res: Response, next: NextFunction): void {
  if (!req.cookies || !req.cookies[CSRF_COOKIE]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: 'strict',
      secure: config.COOKIE_SECURE,
      path: '/',
    });
  }
  next();
}

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const cookieToken: string | undefined = req.cookies?.[CSRF_COOKIE];
    const headerToken = req.get(CSRF_HEADER);

    if (
      !cookieToken ||
      !headerToken ||
      cookieToken.length !== headerToken.length ||
      !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
    ) {
      throw new ForbiddenException('Jeton de sécurité invalide. Rechargez la page et réessayez.');
    }
    return true;
  }
}
