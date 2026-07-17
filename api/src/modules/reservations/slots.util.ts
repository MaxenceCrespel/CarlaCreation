import { DataSource } from 'typeorm';
import { Reservation } from '../../database/entities/reservation.entity';
import { getEffectiveHoursForDate } from '../settings/daily-hours.util';

const SLOT_STEP_MINUTES = 15;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function toHHMM(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

// Returns available start times (HH:MM) for a given date and service
// duration, excluding slots that overlap existing (non-cancelled)
// reservations and past times. Hours are resolved per exact date (admin
// override if set, otherwise closed) — see getEffectiveHoursForDate. A day
// can have several open ranges (e.g. a lunch break); a booking must fit
// entirely inside one range, it never spans the gap between two.
export async function getAvailableSlots(dataSource: DataSource, dateStr: string, durationMinutes: number): Promise<string[]> {
  if (!isValidDateString(dateStr)) return [];

  const hours = await getEffectiveHoursForDate(dataSource, dateStr);
  if (hours.isClosed || hours.ranges.length === 0) return [];

  const existing = await dataSource
    .getRepository(Reservation)
    .createQueryBuilder('r')
    .select(['r.start_time', 'r.end_time'])
    .where('r.reservation_date = :dateStr', { dateStr })
    .andWhere('r.status NOT IN (:...excluded)', { excluded: ['cancelled', 'refused'] })
    .getMany();

  const busy = existing.map((r) => ({ start: toMinutes(r.start_time), end: toMinutes(r.end_time) }));

  const now = new Date();
  const isToday = dateStr === now.toISOString().slice(0, 10);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const slots: string[] = [];
  for (const range of hours.ranges) {
    const openMin = toMinutes(range.openTime);
    const closeMin = toMinutes(range.closeTime);

    for (let start = openMin; start + durationMinutes <= closeMin; start += SLOT_STEP_MINUTES) {
      const end = start + durationMinutes;
      if (isToday && start <= nowMinutes) continue;

      const overlaps = busy.some((b) => start < b.end && end > b.start);
      if (!overlaps) {
        slots.push(toHHMM(start));
      }
    }
  }
  return slots;
}
