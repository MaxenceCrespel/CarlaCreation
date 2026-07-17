import { getEffectiveHoursForDate } from './daily-hours.util';
import { DailyHours } from '../../database/entities/daily-hours.entity';
import { DailyHoursRange } from '../../database/entities/daily-hours-range.entity';

function fakeDataSource(dailyHoursRow: Partial<DailyHours> | null, ranges: Partial<DailyHoursRange>[]) {
  const repos: Record<string, unknown> = {
    [DailyHours.name]: { findOne: jest.fn().mockResolvedValue(dailyHoursRow) },
    [DailyHoursRange.name]: { find: jest.fn().mockResolvedValue(ranges) },
  };
  return { getRepository: (entity: { name: string }) => repos[entity.name] } as any;
}

describe('getEffectiveHoursForDate', () => {
  it('is closed with no ranges when the date has never been set', async () => {
    const dataSource = fakeDataSource(null, []);
    const result = await getEffectiveHoursForDate(dataSource, '2026-08-01');

    expect(result).toEqual({ date: '2026-08-01', dayOfWeek: expect.any(Number), isClosed: true, ranges: [], isSet: false });
  });

  it('is closed when explicitly marked is_closed, even though isSet is true', async () => {
    const dataSource = fakeDataSource({ date: '2026-08-01', is_closed: true }, []);
    const result = await getEffectiveHoursForDate(dataSource, '2026-08-01');

    expect(result.isClosed).toBe(true);
    expect(result.isSet).toBe(true);
    expect(result.ranges).toEqual([]);
  });

  it('returns every open range, ordered by open_time', async () => {
    const dataSource = fakeDataSource(
      { date: '2026-08-01', is_closed: false },
      [
        { open_time: '10:00', close_time: '13:00' },
        { open_time: '16:00', close_time: '19:00' },
      ],
    );
    const result = await getEffectiveHoursForDate(dataSource, '2026-08-01');

    expect(result.isClosed).toBe(false);
    expect(result.ranges).toEqual([
      { openTime: '10:00', closeTime: '13:00' },
      { openTime: '16:00', closeTime: '19:00' },
    ]);
  });
});
