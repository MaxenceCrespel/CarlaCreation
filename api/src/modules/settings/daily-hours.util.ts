import { DataSource } from 'typeorm';
import { DailyHours } from '../../database/entities/daily-hours.entity';
import { DailyHoursRange } from '../../database/entities/daily-hours-range.entity';

export interface TimeRange {
  openTime: string;
  closeTime: string;
}

export interface EffectiveDayHours {
  date: string;
  dayOfWeek: number;
  isClosed: boolean;
  // One or more open windows for the day (e.g. 10:00–13:00 and 16:00–19:00
  // for a lunch break). A booking must fit entirely within a single range.
  ranges: TimeRange[];
  isSet: boolean;
}

// Resolves the hours that apply on a given date. There is no recurring
// weekly pattern: a date is only open if the admin has explicitly added it
// to `daily_hours`. Any date without a row is closed — every availability
// has to be opened by the admin, day by day.
export async function getEffectiveHoursForDate(dataSource: DataSource, dateStr: string): Promise<EffectiveDayHours> {
  const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay();
  const row = await dataSource.getRepository(DailyHours).findOne({ where: { date: dateStr } });

  if (!row) {
    return { date: dateStr, dayOfWeek, isClosed: true, ranges: [], isSet: false };
  }

  const isClosed = row.is_closed;
  const ranges = isClosed
    ? []
    : (
        await dataSource
          .getRepository(DailyHoursRange)
          .find({ where: { date: dateStr }, order: { open_time: 'ASC' } })
      ).map((r) => ({ openTime: r.open_time, closeTime: r.close_time }));

  return { date: dateStr, dayOfWeek, isClosed, ranges, isSet: true };
}
