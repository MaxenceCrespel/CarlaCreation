import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
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

// Standalone DataSource used by the TypeORM CLI (migrations) and by
// standalone scripts (seedAdmin.ts, seed.ts) that run outside the Nest DI
// context. The Nest app itself gets its connection via
// TypeOrmModule.forRoot in database.module.ts, not this file.
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: config.DATABASE_URL,
  entities: [Admin, Service, Reservation, Gallery, ContactMessage, Review, DailyHours, DailyHoursRange, AppSettings],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
});
