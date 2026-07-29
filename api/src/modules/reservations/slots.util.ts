import { DataSource } from 'typeorm';
import { Reservation } from '../../database/entities/reservation.entity';
import { getEffectiveHoursForDate } from '../settings/daily-hours.util';

const SLOT_STEP_MINUTES = 15;

// A booking "à domicile" (Carla travels to the client) blocks extra time on
// both sides for travel — expand its busy interval before comparing it
// against anything else. Studio bookings are unaffected. bufferMinutes is
// the admin-configurable setting (app_settings.travel_buffer_minutes), not
// a constant — passed in explicitly rather than read from anywhere here.
export function effectiveInterval(start: number, end: number, atClientHome: boolean, bufferMinutes: number): { start: number; end: number } {
  if (!atClientHome) return { start, end };
  return { start: start - bufferMinutes, end: end + bufferMinutes };
}

export function intervalsOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && a.end > b.start;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function toHHMM(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// 'YYYY-MM-DD' for a given Date, in the process's local timezone (set to
// Europe/Paris in config.ts). Deliberately NOT `date.toISOString().slice(0,
// 10)` — toISOString() is always UTC regardless of TZ, so around
// midnight-2am Paris time it silently returns the previous day.
export function localDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

export interface AvailableSlotsResult {
  slots: string[];
  // True when even a genuinely empty day (no other bookings at all)
  // couldn't fit this appointment — the round-trip travel buffer plus the
  // service duration is simply longer than every one of that day's open
  // ranges. Distinct from a plain empty `slots` array, which just means
  // "fully booked today" — the client is too far away for this particular
  // appointment to ever fit, not unlucky with timing. Only meaningful for
  // à-domicile bookings; always false otherwise.
  tooFarForAnyOpenRange: boolean;
}

// Returns available start times (HH:MM) for a given date and service
// duration, excluding slots that overlap existing (non-cancelled)
// reservations and past times. Hours are resolved per exact date (admin
// override if set, otherwise closed) — see getEffectiveHoursForDate. A day
// can have several open ranges (e.g. a lunch break); a booking must fit
// entirely inside one range, it never spans the gap between two.
// candidateBufferMinutes is the buffer for the slot being searched — ideally
// the real one-way driving time to the specific address being booked (see
// ReservationsService.resolveTravelBuffer), falling back to the flat admin
// setting when that isn't available. defaultBufferMinutes is used for
// EXISTING reservations that don't have their own persisted
// travel_duration_minutes (booked before this feature, or geocoding failed
// for them) — each existing à-domicile reservation otherwise uses its own
// real travel time, not the global flat setting, since two different
// addresses genuinely take different times to reach.
export async function getAvailableSlots(
  dataSource: DataSource,
  dateStr: string,
  durationMinutes: number,
  atClientHome = false,
  candidateBufferMinutes = 0,
  defaultBufferMinutes = candidateBufferMinutes,
): Promise<AvailableSlotsResult> {
  if (!isValidDateString(dateStr)) return { slots: [], tooFarForAnyOpenRange: false };

  const hours = await getEffectiveHoursForDate(dataSource, dateStr);
  if (hours.isClosed || hours.ranges.length === 0) return { slots: [], tooFarForAnyOpenRange: false };

  // Structural check, independent of any other booking that day: does the
  // round trip + appointment even fit inside the WIDEST open range? If not,
  // no amount of an empty schedule would help — worth telling the client
  // that plainly instead of a generic "nothing available today".
  const requiredSpan = atClientHome ? candidateBufferMinutes * 2 + durationMinutes : durationMinutes;
  const tooFarForAnyOpenRange = atClientHome && hours.ranges.every((r) => toMinutes(r.closeTime) - toMinutes(r.openTime) < requiredSpan);

  const existing = await dataSource
    .getRepository(Reservation)
    .createQueryBuilder('r')
    .select(['r.start_time', 'r.end_time', 'r.at_client_home', 'r.travel_duration_minutes'])
    .where('r.reservation_date = :dateStr', { dateStr })
    .andWhere('r.status NOT IN (:...excluded)', { excluded: ['cancelled', 'refused'] })
    .getMany();

  const busy = existing.map((r) =>
    effectiveInterval(toMinutes(r.start_time), toMinutes(r.end_time), r.at_client_home, r.travel_duration_minutes ?? defaultBufferMinutes),
  );

  const now = new Date();
  const isToday = dateStr === localDateString(now);
  // À-domicile also can't start immediately from right now — she needs the
  // travel buffer just to physically get there, same as at the edges of the
  // open window (see rangeStart below).
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const pastCutoff = atClientHome ? nowMinutes + candidateBufferMinutes : nowMinutes;

  const slots: string[] = [];
  for (const range of hours.ranges) {
    const openMin = toMinutes(range.openTime);
    const closeMin = toMinutes(range.closeTime);
    // À-domicile also needs travel time to/from the edges of the open
    // window itself, not just around other bookings — otherwise the very
    // first slot of the day would ignore the trip to get there at all.
    const rangeStart = atClientHome ? openMin + candidateBufferMinutes : openMin;
    const rangeEnd = atClientHome ? closeMin - candidateBufferMinutes : closeMin;

    for (let start = rangeStart; start + durationMinutes <= rangeEnd; start += SLOT_STEP_MINUTES) {
      const end = start + durationMinutes;
      if (isToday && start <= pastCutoff) continue;

      const candidate = effectiveInterval(start, end, atClientHome, candidateBufferMinutes);
      const overlaps = busy.some((b) => intervalsOverlap(candidate, b));
      if (!overlaps) {
        slots.push(toHHMM(start));
      }
    }
  }
  return { slots, tooFarForAnyOpenRange };
}
