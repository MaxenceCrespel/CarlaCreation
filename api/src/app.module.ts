import * as path from 'path';
import { CanActivate, Injectable, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ScheduleModule } from '@nestjs/schedule';
import { config } from './config';
import { DatabaseModule } from './database/database.module';
import { MailModule } from './modules/mail/mail.module';
import { AuthModule } from './modules/auth/auth.module';
import { ServicesModule } from './modules/services/services.module';
import { GalleryModule } from './modules/gallery/gallery.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ContactModule } from './modules/contact/contact.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SeoModule } from './modules/seo/seo.module';
import { HealthModule } from './modules/health/health.module';
import { MiscModule } from './modules/misc/misc.module';

// Rate limiting (global + the tighter per-route @Throttle overrides on
// login/booking/contact/reviews) would make the integration test suite
// flaky — a single Jest run hits those routes far more than a real user
// would in the same window. Swapped out for a no-op guard when
// NODE_ENV=test; production/dev behaviour is untouched.
@Injectable()
class NoopThrottlerGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

@Module({
  imports: [
    // Global baseline rate limit as a defence against abuse/flooding; tighter
    // limits are applied per-route (login, booking, contact) via @Throttle.
    ThrottlerModule.forRoot({
      throttlers: [{ limit: 300, ttl: 900_000 }],
    }),
    // Powers the @Cron reminder job in ReservationsService (24h-before
    // appointment emails) — registering it here makes SchedulerRegistry
    // available app-wide.
    ScheduleModule.forRoot(),
    // Serves the built React app and falls back to index.html for any
    // client-side route (e.g. /booking, /admin) that isn't a real file —
    // excluding /api, /uploads and /healthz, which are handled by controllers.
    ServeStaticModule.forRoot({
      rootPath: path.join(__dirname, '..', '..', 'client', 'dist'),
      exclude: ['/api/{*splat}', '/uploads/{*splat}', '/healthz', '/robots.txt', '/sitemap.xml'],
    }),
    DatabaseModule,
    MailModule,
    AuthModule,
    ServicesModule,
    GalleryModule,
    ReservationsModule,
    SettingsModule,
    ContactModule,
    ReviewsModule,
    SeoModule,
    HealthModule,
    MiscModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: config.NODE_ENV === 'test' ? NoopThrottlerGuard : ThrottlerGuard,
    },
  ],
})
export class AppModule {}
