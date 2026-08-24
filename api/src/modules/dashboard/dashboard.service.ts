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
  at_client_home: boolean;
  discount_percent: number;
}

@Injectable()
export class DashboardService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // Revenue only counts confirmed/completed reservations (pending is
  // reported separately, not as real income) — see reservations query
  // below excluding cancelled/refused entirely. No price snapshot exists on
  // a reservation, so revenue uses the service's *current* price — a
  // simplification: a later price change also reshapes past figures.
  // discount_percent IS a per-reservation snapshot though (see
  // Reservation.discount_percent), so a promotion applied at booking time
  // keeps reducing that reservation's contribution to CA even if the
  // promotion is later edited or deleted.
  async getDashboard(from: string, to: string) {
    if (!isValidDateString(from) || !isValidDateString(to) || from > to) {
      throw new BadRequestException('Période invalide.');
    }
    const days = Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000) + 1;
    if (days > MAX_RANGE_DAYS) {
      throw new BadRequestException('La période demandée est trop large (366 jours maximum).');
    }

    const now = new Date();

    const reservations: ReservationRow[] = await this.dataSource.query(
      `SELECT r.id, r.service_id, s.name AS service_name, s.price_cents, r.start_time, r.end_time, r.reservation_date, r.status, r.at_client_home, r.discount_percent
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
    let confirmedOrCompletedCount = 0;
    let atHomeCount = 0;
    let studioCount = 0;
    const statusCounts = { pending: 0, confirmed: 0, completed: 0 };
    const serviceStats = new Map<number, { name: string; count: number; revenueCents: number }>();
    // Per-day revenue/duration (confirmed+completed only, same basis as the
    // rest of the revenue figures) — powers the daily bar chart.
    const dailyRevenueCents = new Map<string, number>();
    const dailyBookedMinutes = new Map<string, number>();

    for (const r of reservations) {
      const fullPrice = r.price_cents + (addonSums.get(r.id) ?? 0);
      const total = Math.round(fullPrice * (1 - r.discount_percent / 100));
      statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

      if (r.status === 'pending') {
        pendingCents += total;
        continue;
      }

      const duration = toMinutes(r.end_time) - toMinutes(r.start_time);
      bookedMinutes += duration;
      confirmedOrCompletedCount += 1;
      if (r.at_client_home) atHomeCount += 1;
      else studioCount += 1;
      // Compared against the reservation's actual start time, not just its
      // calendar date — a date-only cutoff would flip every reservation of
      // the day to "généré" the instant midnight (Europe/Paris) hits, even
      // ones scheduled for later that evening that haven't happened yet.
      const startsAt = new Date(`${r.reservation_date}T${r.start_time}:00`);
      if (startsAt <= now) {
        generatedCents += total;
      } else {
        upcomingCents += total;
      }
      dailyRevenueCents.set(r.reservation_date, (dailyRevenueCents.get(r.reservation_date) ?? 0) + total);
      dailyBookedMinutes.set(r.reservation_date, (dailyBookedMinutes.get(r.reservation_date) ?? 0) + duration);

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
    const dailyBreakdown: { date: string; revenueCents: number; bookedHours: number; isClosed: boolean }[] = [];
    for (let i = 0; i < days; i += 1) {
      const d = new Date(`${from}T00:00:00`);
      d.setDate(d.getDate() + i);
      const dateStr = localDateString(d);
      const hours = await getEffectiveHoursForDate(this.dataSource, dateStr);
      dailyBreakdown.push({
        date: dateStr,
        revenueCents: dailyRevenueCents.get(dateStr) ?? 0,
        bookedHours: round1((dailyBookedMinutes.get(dateStr) ?? 0) / 60),
        isClosed: hours.isClosed || hours.ranges.length === 0,
      });
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

    // Cancellation/refusal rate needs every status for the period, including
    // the cancelled/refused rows the main query above deliberately excludes.
    const statusBreakdown: { status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'refused'; count: string }[] =
      await this.dataSource.query(
        `SELECT status, COUNT(*)::int AS count FROM reservations WHERE reservation_date BETWEEN $1 AND $2 GROUP BY status`,
        [from, to],
      );
    let cancelledOrRefusedCount = 0;
    let allStatusesTotal = 0;
    for (const row of statusBreakdown) {
      const count = Number(row.count);
      allStatusesTotal += count;
      if (row.status === 'cancelled' || row.status === 'refused') cancelledOrRefusedCount += count;
    }
    const cancellationRatePercent = allStatusesTotal > 0 ? round1((cancelledOrRefusedCount / allStatusesTotal) * 100) : 0;

    const topServices = [...serviceStats.entries()]
      .map(([serviceId, s]) => ({ serviceId, name: s.name, count: s.count, revenueCents: s.revenueCents }))
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 5);

    // Average € actually earned per booked hour (confirmed/completed only,
    // same basis as generatedCents/upcomingCents), then projected onto
    // every open hour in the period — "what if the whole schedule filled
    // up at this same average rate", not a guarantee.
    const avgRevenuePerHourCents = bookedMinutes > 0 ? Math.round((generatedCents + upcomingCents) / (bookedMinutes / 60)) : 0;
    const projectedFullCapacityCents = Math.round(avgRevenuePerHourCents * (openMinutes / 60));
    const avgBasketCents = confirmedOrCompletedCount > 0 ? Math.round((generatedCents + upcomingCents) / confirmedOrCompletedCount) : 0;

    // Expenses logged for the period (Expense.expense_date, not created_at —
    // an expense entered late for an earlier purchase still counts against
    // that purchase's month). Net margin compares against generatedCents
    // only (revenue already earned so far), not the upcoming/pending
    // buckets — an expense already happened, a future booking hasn't.
    const expenseRows: { category: string; total: string }[] = await this.dataSource.query(
      `SELECT category, SUM(amount_cents) AS total FROM expenses WHERE expense_date BETWEEN $1 AND $2 GROUP BY category ORDER BY total DESC`,
      [from, to],
    );
    const expensesByCategory = expenseRows.map((row) => ({ category: row.category, amountCents: Number(row.total) }));
    const expensesTotalCents = expensesByCategory.reduce((sum, row) => sum + row.amountCents, 0);
    const netCents = generatedCents - expensesTotalCents;

    return {
      period: { from, to },
      revenue: {
        generatedCents,
        upcomingCents,
        pendingCents,
        avgPerHourCents: avgRevenuePerHourCents,
        projectedFullCapacityCents,
        avgBasketCents,
      },
      expenses: {
        totalCents: expensesTotalCents,
        byCategory: expensesByCategory,
      },
      netCents,
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
        cancellationRatePercent,
      },
      location: { atHomeCount, studioCount },
      newReservationsCount,
      topServices,
      dailyBreakdown,
    };
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
