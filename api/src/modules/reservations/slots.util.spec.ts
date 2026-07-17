import { getAvailableSlots, isValidDateString, toHHMM, toMinutes } from './slots.util';
import { DailyHours } from '../../database/entities/daily-hours.entity';
import { DailyHoursRange } from '../../database/entities/daily-hours-range.entity';
import { Reservation } from '../../database/entities/reservation.entity';

function fakeDataSource(opts: {
  isClosed: boolean;
  ranges: { open_time: string; close_time: string }[];
  busy?: { start_time: string; end_time: string }[];
}) {
  const repos: Record<string, unknown> = {
    [DailyHours.name]: { findOne: jest.fn().mockResolvedValue({ date: 'x', is_closed: opts.isClosed }) },
    [DailyHoursRange.name]: { find: jest.fn().mockResolvedValue(opts.isClosed ? [] : opts.ranges) },
    [Reservation.name]: {
      createQueryBuilder: () => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(opts.busy ?? []),
      }),
    },
  };
  return { getRepository: (entity: { name: string }) => repos[entity.name] } as any;
}

describe('toMinutes / toHHMM', () => {
  it('round-trip correctly', () => {
    expect(toMinutes('09:15')).toBe(555);
    expect(toHHMM(555)).toBe('09:15');
  });
});

describe('isValidDateString', () => {
  it('accepts a well-formed date', () => expect(isValidDateString('2026-08-01')).toBe(true));
  it('rejects a malformed date', () => {
    expect(isValidDateString('01-08-2026')).toBe(false);
    expect(isValidDateString('not-a-date')).toBe(false);
  });
});

describe('getAvailableSlots', () => {
  const FUTURE_DATE = '2099-01-01'; // always "in the future" so past-time exclusion never kicks in

  it('returns no slots when the day is closed', async () => {
    const dataSource = fakeDataSource({ isClosed: true, ranges: [] });
    const slots = await getAvailableSlots(dataSource, FUTURE_DATE, 30);
    expect(slots).toEqual([]);
  });

  it('generates 15-minute-stepped slots that fit within a single range', async () => {
    const dataSource = fakeDataSource({ isClosed: false, ranges: [{ open_time: '10:00', close_time: '11:00' }] });
    const slots = await getAvailableSlots(dataSource, FUTURE_DATE, 30);

    // Last slot must leave room for the full 30-minute duration before closing.
    expect(slots).toEqual(['10:00', '10:15', '10:30']);
  });

  it('never returns a slot that spans the gap between two ranges (lunch break)', async () => {
    const dataSource = fakeDataSource({
      isClosed: false,
      ranges: [
        { open_time: '10:00', close_time: '11:00' },
        { open_time: '14:00', close_time: '15:00' },
      ],
    });
    // 60-minute service: fits exactly in either range, but must never bridge the 11:00–14:00 gap.
    const slots = await getAvailableSlots(dataSource, FUTURE_DATE, 60);

    expect(slots).toEqual(['10:00', '14:00']);
  });

  it('excludes slots that overlap an existing (non-cancelled) reservation', async () => {
    const dataSource = fakeDataSource({
      isClosed: false,
      ranges: [{ open_time: '10:00', close_time: '11:00' }],
      busy: [{ start_time: '10:15', end_time: '10:45' }],
    });
    const slots = await getAvailableSlots(dataSource, FUTURE_DATE, 15);

    expect(slots).not.toContain('10:15');
    expect(slots).not.toContain('10:30');
    expect(slots).toContain('10:00');
    expect(slots).toContain('10:45');
  });

  it('excludes past time slots when the requested date is today', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T10:30:00'));
    const dataSource = fakeDataSource({ isClosed: false, ranges: [{ open_time: '09:00', close_time: '12:00' }] });

    const slots = await getAvailableSlots(dataSource, '2026-08-01', 15);

    expect(slots).not.toContain('09:00');
    expect(slots).not.toContain('10:15');
    expect(slots).toContain('10:45');

    jest.useRealTimers();
  });
});
