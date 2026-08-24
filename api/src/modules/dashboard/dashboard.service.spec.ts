import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import * as dailyHoursUtil from '../settings/daily-hours.util';

jest.mock('../settings/daily-hours.util');

describe('DashboardService', () => {
  let service: DashboardService;
  let dataSource: { query: jest.Mock };
  const getEffectiveHoursForDate = dailyHoursUtil.getEffectiveHoursForDate as jest.Mock;

  beforeEach(async () => {
    dataSource = { query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardService, { provide: getDataSourceToken(), useValue: dataSource }],
    }).compile();

    service = module.get(DashboardService);
  });

  it('rejects an invalid date', async () => {
    await expect(service.getDashboard('not-a-date', '2026-01-31')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a period where "from" is after "to"', async () => {
    await expect(service.getDashboard('2026-02-01', '2026-01-01')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a period longer than 366 days', async () => {
    await expect(service.getDashboard('2020-01-01', '2026-01-01')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aggregates revenue, hours and top services for a single day', async () => {
    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM reservations r')) {
        return Promise.resolve([
          {
            id: 1,
            service_id: 1,
            service_name: 'Coupe Femme',
            price_cents: 3000,
            start_time: '09:00',
            end_time: '09:30',
            reservation_date: '2026-01-01',
            status: 'confirmed',
            at_client_home: true,
            discount_percent: 0,
          },
          {
            id: 2,
            service_id: 1,
            service_name: 'Coupe Femme',
            price_cents: 3000,
            start_time: '10:00',
            end_time: '10:30',
            reservation_date: '2026-01-01',
            status: 'pending',
            at_client_home: false,
            discount_percent: 0,
          },
        ]);
      }
      if (sql.includes('reservation_addons')) {
        return Promise.resolve([{ reservation_id: 1, total: '500' }]);
      }
      if (sql.includes('GROUP BY status')) {
        return Promise.resolve([
          { status: 'confirmed', count: 1 },
          { status: 'pending', count: 1 },
          { status: 'cancelled', count: 1 },
        ]);
      }
      if (sql.includes('COUNT(*)::int')) {
        return Promise.resolve([{ count: 2 }]);
      }
      if (sql.includes('FROM expenses')) {
        return Promise.resolve([{ category: 'Produits', total: '1200' }]);
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    getEffectiveHoursForDate.mockResolvedValue({
      date: '2026-01-01',
      dayOfWeek: 4,
      isClosed: false,
      isSet: true,
      ranges: [{ openTime: '09:00', closeTime: '12:00' }],
    });

    const result = await service.getDashboard('2026-01-01', '2026-01-01');

    expect(result.revenue).toEqual({
      generatedCents: 3500,
      upcomingCents: 0,
      pendingCents: 3000,
      avgPerHourCents: 7000, // 3500 / 0.5h
      projectedFullCapacityCents: 21000, // 7000/h * 3h open
      avgBasketCents: 3500, // 3500 / 1 confirmed+completed reservation
    });
    expect(result.reservationsCount).toEqual({
      pending: 1,
      confirmed: 1,
      completed: 0,
      total: 2,
      cancellationRatePercent: 33.3, // 1 cancelled / 3 total (confirmed+pending+cancelled)
    });
    expect(result.location).toEqual({ atHomeCount: 1, studioCount: 0 }); // only the confirmed reservation counts
    expect(result.hours.bookedHours).toBe(0.5); // only the confirmed reservation's 30min
    expect(result.hours.openHours).toBe(3); // 09:00-12:00
    expect(result.hours.availableHours).toBe(2); // 180min open - 60min busy (confirmed + pending)
    expect(result.hours.fillRatePercent).toBeCloseTo(33.3, 1);
    expect(result.newReservationsCount).toBe(2);
    expect(result.topServices).toEqual([{ serviceId: 1, name: 'Coupe Femme', count: 1, revenueCents: 3500 }]);
    expect(result.dailyBreakdown).toEqual([{ date: '2026-01-01', revenueCents: 3500, bookedHours: 0.5, isClosed: false }]);
    expect(result.expenses).toEqual({ totalCents: 1200, byCategory: [{ category: 'Produits', amountCents: 1200 }] });
    expect(result.netCents).toBe(2300); // 3500 generated - 1200 expenses
  });

  it('applies a reservation\'s discount_percent to its contribution to CA (mère qui prend rdv à tarif réduit ne fausse pas le CA)', async () => {
    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM reservations r')) {
        return Promise.resolve([
          {
            id: 1,
            service_id: 1,
            service_name: 'Coupe Femme',
            price_cents: 4000,
            start_time: '09:00',
            end_time: '09:30',
            reservation_date: '2026-01-01',
            status: 'confirmed',
            at_client_home: false,
            discount_percent: 10, // -10% tarif étudiant
          },
        ]);
      }
      if (sql.includes('reservation_addons')) return Promise.resolve([]);
      if (sql.includes('GROUP BY status')) return Promise.resolve([{ status: 'confirmed', count: 1 }]);
      if (sql.includes('COUNT(*)::int')) return Promise.resolve([{ count: 1 }]);
      if (sql.includes('FROM expenses')) return Promise.resolve([]);
      throw new Error(`Unexpected query: ${sql}`);
    });
    getEffectiveHoursForDate.mockResolvedValue({
      date: '2026-01-01',
      dayOfWeek: 4,
      isClosed: false,
      isSet: true,
      ranges: [{ openTime: '09:00', closeTime: '12:00' }],
    });

    const result = await service.getDashboard('2026-01-01', '2026-01-01');

    // 4000 * 0.9 = 3600, not the full 4000
    expect(result.revenue.generatedCents).toBe(3600);
    expect(result.topServices).toEqual([{ serviceId: 1, name: 'Coupe Femme', count: 1, revenueCents: 3600 }]);
  });

  it("keeps a later-today reservation as \"upcoming\" instead of flipping it to \"generated\" at midnight (date-only cutoff bug)", async () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const past = new Date(now.getTime() - 60 * 60 * 1000); // 1h ago
    const future = new Date(now.getTime() + 60 * 60 * 1000); // 1h from now
    const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM reservations r')) {
        return Promise.resolve([
          {
            id: 1,
            service_id: 1,
            service_name: 'Déjà passé',
            price_cents: 3000,
            start_time: hhmm(past),
            end_time: hhmm(past),
            reservation_date: todayStr,
            status: 'confirmed',
            at_client_home: false,
            discount_percent: 0,
          },
          {
            id: 2,
            service_id: 2,
            service_name: 'Plus tard ce soir',
            price_cents: 5000,
            start_time: hhmm(future),
            end_time: hhmm(future),
            reservation_date: todayStr,
            status: 'confirmed',
            at_client_home: false,
            discount_percent: 0,
          },
        ]);
      }
      if (sql.includes('reservation_addons')) return Promise.resolve([]);
      if (sql.includes('GROUP BY status')) return Promise.resolve([{ status: 'confirmed', count: 2 }]);
      if (sql.includes('COUNT(*)::int')) return Promise.resolve([{ count: 2 }]);
      if (sql.includes('FROM expenses')) return Promise.resolve([]);
      throw new Error(`Unexpected query: ${sql}`);
    });
    getEffectiveHoursForDate.mockResolvedValue({
      date: todayStr,
      dayOfWeek: now.getDay(),
      isClosed: false,
      isSet: true,
      ranges: [{ openTime: '00:00', closeTime: '23:59' }],
    });

    const result = await service.getDashboard(todayStr, todayStr);

    expect(result.revenue.generatedCents).toBe(3000);
    expect(result.revenue.upcomingCents).toBe(5000);
  });

  it('skips closed days when computing open/available hours', async () => {
    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM reservations r')) return Promise.resolve([]);
      if (sql.includes('GROUP BY status')) return Promise.resolve([]);
      if (sql.includes('COUNT(*)::int')) return Promise.resolve([{ count: 0 }]);
      if (sql.includes('FROM expenses')) return Promise.resolve([]);
      throw new Error(`Unexpected query: ${sql}`);
    });
    getEffectiveHoursForDate.mockResolvedValue({
      date: '2026-01-01',
      dayOfWeek: 4,
      isClosed: true,
      isSet: false,
      ranges: [],
    });

    const result = await service.getDashboard('2026-01-01', '2026-01-01');

    expect(result.hours.openHours).toBe(0);
    expect(result.hours.availableHours).toBe(0);
    expect(result.hours.fillRatePercent).toBe(0);
    expect(result.dailyBreakdown).toEqual([{ date: '2026-01-01', revenueCents: 0, bookedHours: 0, isClosed: true }]);
  });
});
