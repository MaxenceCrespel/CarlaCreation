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
          },
        ]);
      }
      if (sql.includes('reservation_addons')) {
        return Promise.resolve([{ reservation_id: 1, total: '500' }]);
      }
      if (sql.includes('COUNT(*)::int')) {
        return Promise.resolve([{ count: 2 }]);
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

    expect(result.revenue).toEqual({ generatedCents: 3500, upcomingCents: 0, pendingCents: 3000 });
    expect(result.reservationsCount).toEqual({ pending: 1, confirmed: 1, completed: 0, total: 2 });
    expect(result.hours.bookedHours).toBe(0.5); // only the confirmed reservation's 30min
    expect(result.hours.openHours).toBe(3); // 09:00-12:00
    expect(result.hours.availableHours).toBe(2); // 180min open - 60min busy (confirmed + pending)
    expect(result.hours.fillRatePercent).toBeCloseTo(33.3, 1);
    expect(result.newReservationsCount).toBe(2);
    expect(result.topServices).toEqual([{ serviceId: 1, name: 'Coupe Femme', count: 1, revenueCents: 3500 }]);
  });

  it('skips closed days when computing open/available hours', async () => {
    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM reservations r')) return Promise.resolve([]);
      if (sql.includes('COUNT(*)::int')) return Promise.resolve([{ count: 0 }]);
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
  });
});
