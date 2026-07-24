import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { config } from '../config';
import { Admin } from './entities/admin.entity';
import { Service } from './entities/service.entity';
import { Reservation } from './entities/reservation.entity';
import { Gallery } from './entities/gallery.entity';
import { ContactMessage } from './entities/contact-message.entity';
import { Review } from './entities/review.entity';
import { DailyHours } from './entities/daily-hours.entity';
import { DailyHoursRange } from './entities/daily-hours-range.entity';
import { AppSettings } from './entities/app-settings.entity';
import { ServiceAddon } from './entities/service-addon.entity';
import { ReservationAddon } from './entities/reservation-addon.entity';
import { ServiceCategory } from './entities/service-category.entity';

// `synchronize: false` permanently — even in dev. Migrations
// (database/migrations/*.ts, run via `npm run migration:run`) are the only
// source of truth for the schema, so it stays identical and reproducible
// across dev, CI and any future deployment.
@Global()
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: config.DATABASE_URL,
      entities: [Admin, Service, Reservation, Gallery, ContactMessage, Review, DailyHours, DailyHoursRange, AppSettings, ServiceAddon, ReservationAddon, ServiceCategory],
      synchronize: false,
      migrationsRun: false,
    }),
    TypeOrmModule.forFeature([Admin, Service, Reservation, Gallery, ContactMessage, Review, DailyHours, DailyHoursRange, AppSettings, ServiceAddon, ReservationAddon, ServiceCategory]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
