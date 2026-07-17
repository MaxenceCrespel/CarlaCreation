import { Controller, Get } from '@nestjs/common';
import { config } from '../../config';
import { siteConfig } from '../../site-config';

@Controller('api')
export class MiscController {
  // The issueCsrfToken middleware (applied globally) sets the cookie before
  // this handler runs; the body just needs to exist for the frontend to hit.
  @Get('csrf-token')
  csrfToken() {
    return { ok: true };
  }

  @Get('site-config')
  getSiteConfig() {
    return { ...siteConfig, siteUrl: config.PUBLIC_ORIGIN };
  }
}
