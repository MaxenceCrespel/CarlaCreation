import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DailyHours } from '../../database/entities/daily-hours.entity';
import { DailyHoursRange } from '../../database/entities/daily-hours-range.entity';
import { AppSettings } from '../../database/entities/app-settings.entity';
import { TravelFeeTier } from '../../database/entities/travel-fee-tier.entity';
import { isValidDateString, localDateString } from '../reservations/slots.util';
import { getEffectiveHoursForDate, EffectiveDayHours } from './daily-hours.util';
import { UpdateDailyHoursDto, TravelFeeTierDto } from './dto/settings.dto';

const WINDOW_DAYS = 60;
// Fallback only used if the singleton row is somehow missing (it's always
// seeded by init.sql / the AddAppSettings migration) — keeps this read
// from ever hard-failing the booking flow.
const DEFAULT_TRAVEL_BUFFER_MINUTES = 30;
// Same fallback rationale as above — mirrors the app_settings default.
const DEFAULT_TRAVEL_FEE_FALLBACK_CENTS = 200;
// Same rationale, mirroring the seeded default tier schedule (free under
// 10km, then a flat 2€ surcharge) in case the table is somehow empty.
const DEFAULT_TRAVEL_FEE_TIERS: TravelFeeTierDto[] = [
  { minKm: 0, feeCents: 0 },
  { minKm: 10, feeCents: 200 },
];

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
      const dateStr = localDateString(d);
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

  // Only used when a client's distance couldn't be determined at all
  // (geocoding disabled/unresolvable) — see TravelFeeTier for the real,
  // distance-based fee schedule used the rest of the time.
  async getTravelFeeFallbackCents(): Promise<number> {
    const row = await this.dataSource.getRepository(AppSettings).findOne({ where: { id: 1 } });
    return row?.travel_fee_fallback_cents ?? DEFAULT_TRAVEL_FEE_FALLBACK_CENTS;
  }

  async setTravelFeeFallbackCents(cents: number): Promise<void> {
    if (!Number.isInteger(cents) || cents < 0 || cents > 10000) {
      throw new BadRequestException('Le frais de repli doit être un entier entre 0 et 10000 centimes.');
    }
    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(AppSettings)
      .values({ id: 1, travel_fee_fallback_cents: cents })
      .orUpdate(['travel_fee_fallback_cents'], ['id'])
      .execute();
  }

  // Sorted ascending by min_km — callers rely on this order to find the
  // applicable tier (the last one at or below the actual distance).
  async getTravelFeeTiers(): Promise<TravelFeeTierDto[]> {
    const rows = await this.dataSource.getRepository(TravelFeeTier).find({ order: { min_km: 'ASC' } });
    if (rows.length === 0) return DEFAULT_TRAVEL_FEE_TIERS;
    return rows.map((r) => ({ minKm: r.min_km, feeCents: r.fee_cents }));
  }

  // Replaces the entire fee schedule at once.
  async setTravelFeeTiers(tiers: TravelFeeTierDto[]): Promise<void> {
    if (!tiers.some((t) => t.minKm === 0)) {
      throw new BadRequestException("La liste doit inclure un palier à partir de 0 km (le rayon gratuit).");
    }
    const seen = new Set<number>();
    for (const tier of tiers) {
      if (seen.has(tier.minKm)) {
        throw new BadRequestException(`Le palier à ${tier.minKm} km est en double.`);
      }
      seen.add(tier.minKm);
    }

    await this.dataSource.transaction(async (manager) => {
      // manager.delete(Entity, {}) throws ("empty criteria not allowed") —
      // a query builder delete with no where clause is the correct way to
      // clear the whole table.
      await manager.createQueryBuilder().delete().from(TravelFeeTier).execute();
      await manager.insert(
        TravelFeeTier,
        tiers.map((t) => ({ min_km: t.minKm, fee_cents: t.feeCents })),
      );
    });
  }
}
