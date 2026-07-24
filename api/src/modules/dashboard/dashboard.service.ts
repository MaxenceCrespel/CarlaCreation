import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { getEffectiveHoursForDate } from '../settings/daily-hours.util';
import { isValidDateString, localDateString, toMinutes } from '../reservations/slots.util';

const MAX_RANGE_DAYS = 366;

interface ReservationRow {
  id: number;
  service_id: number;
  service_name: string;
  price_cents: number;
  start_time: string;
  end_time: string;
  reservation_date: string;
  status: 'pending' | 'confirmed' | 'completed';
}

@Injectable()
export class DashboardService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // Revenue only counts confirmed/completed reservations (pending is
  // reported separately, not as real income) — see reservations query
  // below excluding cancelled/refused entirely. No price snapshot exists on
  // a reservation, so revenue uses the service's *current* price — a
  // simplification: a later price change also reshapes past figures.
  async getDashboard(from: string, to: string) {
    if (!isValidDateString(from) || !isValidDateString(to) || from > to) {
      throw new BadRequestException('Période invalide.');
    }
    const days = Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000) + 1;
    if (days > MAX_RANGE_DAYS) {
      throw new BadRequestException('La période demandée est trop large (366 jours maximum).');
    }

    const today = localDateString(new Date());

    const reservations: ReservationRow[] = await this.dataSource.query(
      `SELECT r.id, r.service_id, s.name AS service_name, s.price_cents, r.start_time, r.end_time, r.reservation_date, r.status
       FROM reservations r
       JOIN services s ON s.id = r.service_id
       WHERE r.reservation_date BETWEEN $1 AND $2 AND r.status NOT IN ('cancelled', 'refused')`,
      [from, to],
    );

    const reservationIds = reservations.map((r) => r.id);
    const addonSums = new Map<number, number>();
    if (reservationIds.length > 0) {
      const addonRows: { reservation_id: number; total: string }[] = await this.dataSource.query(
        `SELECT reservation_id, SUM(extra_price_cents) AS total FROM reservation_addons WHERE reservation_id = ANY($1) GROUP BY reservation_id`,
        [reservationIds],
      );
      for (const row of addonRows) addonSums.set(row.reservation_id, Number(row.total));
    }

    let generatedCents = 0;
    let upcomingCents = 0;
    let pendingCents = 0;
    let bookedMinutes = 0;
    const statusCounts = { pending: 0, confirmed: 0, completed: 0 };
    const serviceStats = new Map<number, { name: string; count: number; revenueCents: number }>();

    for (const r of reservations) {
      const total = r.price_cents + (addonSums.get(r.id) ?? 0);
      statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

      if (r.status === 'pending') {
        pendingCents += total;
        continue;
      }

      bookedMinutes += toMinutes(r.end_time) - toMinutes(r.start_time);
      if (r.reservation_date <= today) {
        generatedCents += total;
      } else {
        upcomingCents += total;
      }

      const stat = serviceStats.get(r.service_id) ?? { name: r.service_name, count: 0, revenueCents: 0 };
      stat.count += 1;
      stat.revenueCents += total;
      serviceStats.set(r.service_id, stat);
    }

    // Open vs busy minutes across the period, day by day. Only days the
    // admin explicitly opened count as "available" — there's no recurring
    // weekly pattern in this app (see getEffectiveHoursForDate). Busy
    // minutes include pending reservations too (they still occupy the
    // slot), unlike the revenue figures above.
    const byDate = new Map<string, ReservationRow[]>();
    for (const r of reservations) {
      const list = byDate.get(r.reservation_date) ?? [];
      list.push(r);
      byDate.set(r.reservation_date, list);
    }
    let openMinutes = 0;
    let busyMinutes = 0;
    for (let i = 0; i < days; i += 1) {
      const d = new Date(`${from}T00:00:00`);
      d.setDate(d.getDate() + i);
      const dateStr = localDateString(d);
      const hours = await getEffectiveHoursForDate(this.dataSource, dateStr);
      if (hours.isClosed || hours.ranges.length === 0) continue;
      const dayOpenMinutes = hours.ranges.reduce((sum, range) => sum + (toMinutes(range.closeTime) - toMinutes(range.openTime)), 0);
      openMinutes += dayOpenMinutes;
      const dayBusyMinutes = (byDate.get(dateStr) ?? []).reduce((sum, r) => sum + (toMinutes(r.end_time) - toMinutes(r.start_time)), 0);
      busyMinutes += Math.min(dayBusyMinutes, dayOpenMinutes);
    }
    const availableMinutes = Math.max(0, openMinutes - busyMinutes);
    const fillRatePercent = openMinutes > 0 ? Math.round((busyMinutes / openMinutes) * 1000) / 10 : 0;

    const [{ count: newReservationsCount }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM reservations WHERE created_at::date BETWEEN $1 AND $2`,
      [from, to],
    );

    const topServices = [...serviceStats.entries()]
      .map(([serviceId, s]) => ({ serviceId, name: s.name, count: s.count, revenueCents: s.revenueCents }))
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 5);

    return {
      period: { from, to },
      revenue: { generatedCents, upcomingCents, pendingCents },
      hours: {
        bookedHours: round1(bookedMinutes / 60),
        openHours: round1(openMinutes / 60),
        availableHours: round1(availableMinutes / 60),
        fillRatePercent,
      },
      reservationsCount: {
        pending: statusCounts.pending,
        confirmed: statusCounts.confirmed,
        completed: statusCounts.completed,
        total: reservations.length,
      },
      newReservationsCount,
      topServices,
    };
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
