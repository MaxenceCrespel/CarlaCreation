import { Controller, Get } from '@nestjs/common';
import { config } from '../../config';
import { siteConfig } from '../../site-config';
import { SettingsService } from '../settings/settings.service';

@Controller('api')
export class MiscController {
  constructor(private readonly settingsService: SettingsService) {}

  // The issueCsrfToken middleware (applied globally) sets the cookie before
  // this handler runs; the body just needs to exist for the frontend to hit.
  @Get('csrf-token')
  csrfToken() {
    return { ok: true };
  }

  @Get('site-config')
  async getSiteConfig() {
    // siteAddress is deliberately excluded: it must only ever appear in the
    // confirmation email (see MailService), never on the public site or its
    // public API — Carla works from home, not a public storefront.
    const { siteAddress: _siteAddress, ...publicConfig } = siteConfig;
    return {
      ...publicConfig,
      siteUrl: config.PUBLIC_ORIGIN,
      travelFeeCents: await this.settingsService.getTravelFeeCents(),
    };
  }
}
