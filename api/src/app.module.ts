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
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { StripeModule } from './modules/stripe/stripe.module';
import { ImagesModule } from './modules/images/images.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SeoModule } from './modules/seo/seo.module';
import { HealthModule } from './modules/health/health.module';
import { MiscModule } from './modules/misc/misc.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { CalendarFeedModule } from './modules/calendar-feed/calendar-feed.module';
import { PushModule } from './modules/push/push.module';
import { ProductsModule } from './modules/products/products.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { ClientsModule } from './modules/clients/clients.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { ClientAuthModule } from './modules/client-auth/client-auth.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { MessagingModule } from './modules/messaging/messaging.module';

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
      exclude: ['/api/{*splat}', '/uploads/{*splat}', '/img/{*splat}', '/healthz', '/robots.txt', '/sitemap.xml'],
      serveStaticOptions: {
        // The build's /assets files carry a content hash in their name: cache
        // them for a year. index.html (which points at them) must always be
        // revalidated, or a new deployment would never be picked up.
        setHeaders: (res: import('http').ServerResponse, filePath: string) => {
          res.setHeader(
            'Cache-Control',
            filePath.endsWith('index.html') ? 'no-cache' : filePath.includes(`${path.sep}assets${path.sep}`) || filePath.includes(`${path.sep}fonts${path.sep}`) ? 'public, max-age=31536000, immutable' : 'public, max-age=86400',
          );
        },
      },
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
    DashboardModule,
    CalendarFeedModule,
    PushModule,
    ProductsModule,
    InvoicesModule,
    ExpensesModule,
    ClientsModule,
    PromotionsModule,
    ClientAuthModule,
    RewardsModule,
    MessagingModule,
    AnalyticsModule,
    StripeModule,
    ImagesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: config.NODE_ENV === 'test' ? NoopThrottlerGuard : ThrottlerGuard,
    },
  ],
})
export class AppModule {}
