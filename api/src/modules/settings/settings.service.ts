import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DailyHours } from '../../database/entities/daily-hours.entity';
import { DailyHoursRange } from '../../database/entities/daily-hours-range.entity';
import { AppSettings } from '../../database/entities/app-settings.entity';
import { isValidDateString } from '../reservations/slots.util';
import { getEffectiveHoursForDate, EffectiveDayHours } from './daily-hours.util';
import { UpdateDailyHoursDto } from './dto/settings.dto';

const WINDOW_DAYS = 60;
// Fallback only used if the singleton row is somehow missing (it's always
// seeded by init.sql / the AddAppSettings migration) — keeps this read
// from ever hard-failing the booking flow.
const DEFAULT_TRAVEL_BUFFER_MINUTES = 30;

@Injectable()
export class SettingsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // Rolling window starting today, resolving each date to its effective
  // hours (admin override if set, otherwise closed).
  async getDailyHoursWindow(days = WINDOW_DAYS): Promise<EffectiveDayHours[]> {
    const result: EffectiveDayHours[] = [];
    const start = new Date();
    for (let i = 0; i < days; i += 1) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      result.push(await getEffectiveHoursForDate(this.dataSource, dateStr));
    }
    return result;
  }

  async setDailyHours(date: string, dto: UpdateDailyHoursDto): Promise<void> {
    if (!isValidDateString(date)) {
      throw new BadRequestException('Date invalide.');
    }

    const isClosed = dto.isClosed;
    const ranges = isClosed ? [] : dto.ranges ?? [];

    if (!isClosed) {
      if (ranges.length === 0) {
        throw new BadRequestException('Au moins un créneau horaire est requis.');
      }
      for (const range of ranges) {
        if (range.openTime >= range.closeTime) {
          throw new BadRequestException("Dans chaque créneau, l'heure de fermeture doit être après l'heure d'ouverture.");
        }
      }
      // Ranges must not overlap (e.g. 10:00–14:00 and 13:00–19:00 would be
      // ambiguous) — sort by start time and check each one ends before the
      // next one starts.
      const sorted = [...ranges].sort((a, b) => a.openTime.localeCompare(b.openTime));
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i].openTime < sorted[i - 1].closeTime) {
          throw new BadRequestException('Les créneaux horaires ne doivent pas se chevaucher.');
        }
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .insert()
        .into(DailyHours)
        .values({ date, is_closed: isClosed })
        .orUpdate(['is_closed'], ['date'])
        .execute();

      await manager.delete(DailyHoursRange, { date });

      if (ranges.length > 0) {
        await manager.insert(
          DailyHoursRange,
          ranges.map((range) => ({ date, open_time: range.openTime, close_time: range.closeTime })),
        );
      }
    });
  }

  // Reverts a date back to closed-by-default by removing its override
  // (ON DELETE CASCADE also clears any ranges for that date).
  async resetDailyHours(date: string): Promise<void> {
    const result = await this.dataSource.getRepository(DailyHours).delete(date);
    if (result.affected === 0) {
      throw new NotFoundException("Ce jour n'a pas de personnalisation à supprimer.");
    }
  }

  async getTravelBufferMinutes(): Promise<number> {
    const row = await this.dataSource.getRepository(AppSettings).findOne({ where: { id: 1 } });
    return row?.travel_buffer_minutes ?? DEFAULT_TRAVEL_BUFFER_MINUTES;
  }

  async setTravelBufferMinutes(minutes: number): Promise<void> {
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 240) {
      throw new BadRequestException('Le temps de trajet doit être un entier entre 0 et 240 minutes.');
    }
    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(AppSettings)
      .values({ id: 1, travel_buffer_minutes: minutes })
      .orUpdate(['travel_buffer_minutes'], ['id'])
      .execute();
  }
}
