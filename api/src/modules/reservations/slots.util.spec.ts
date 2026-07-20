import { getAvailableSlots, isValidDateString, localDateString, toHHMM, toMinutes } from './slots.util';
import { DailyHours } from '../../database/entities/daily-hours.entity';
import { DailyHoursRange } from '../../database/entities/daily-hours-range.entity';
import { Reservation } from '../../database/entities/reservation.entity';

function fakeDataSource(opts: {
  isClosed: boolean;
  ranges: { open_time: string; close_time: string }[];
  busy?: { start_time: string; end_time: string; at_client_home?: boolean }[];
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

describe('localDateString', () => {
  // Mutating process.env.TZ mid-test is unreliable — Node/V8 doesn't
  // consistently re-read it after Date internals have already been used in
  // the process, so a test built that way passes or fails depending on
  // execution order/platform rather than on the code being right. Instead,
  // construct Dates via explicit (year, month, day, hour, minute) — that
  // constructor always uses local time regardless of the runtime's
  // configured zone — and assert against the same Date's own local getters,
  // so the test is deterministic on every machine.
  it("reads the Date's local getters (getFullYear/getMonth/getDate), not toISOString() (always UTC)", () => {
    const d = new Date(2026, 0, 16, 0, 30); // local: 16 Jan 2026, 00:30
    expect(localDateString(d)).toBe('2026-01-16');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(16);
  });

  it('pads single-digit month and day', () => {
    const d = new Date(2026, 2, 5); // local: 5 Mar 2026
    expect(localDateString(d)).toBe('2026-03-05');
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

  it('blocks a wider window around an existing à-domicile booking (travel buffer)', async () => {
    // A 30-minute buffer around a 10:15–10:45 home visit effectively
    // busies 09:45–11:15.
    const dataSource = fakeDataSource({
      isClosed: false,
      ranges: [{ open_time: '09:00', close_time: '12:00' }],
      busy: [{ start_time: '10:15', end_time: '10:45', at_client_home: true }],
    });
    const slots = await getAvailableSlots(dataSource, FUTURE_DATE, 15, false, 30);

    expect(slots).not.toContain('09:45');
    expect(slots).not.toContain('10:30');
    expect(slots).not.toContain('11:00');
    expect(slots).toContain('09:30');
    expect(slots).toContain('11:15');
  });

  it('expands the candidate slot itself with a travel buffer when booking à domicile', async () => {
    const dataSource = fakeDataSource({
      isClosed: false,
      ranges: [{ open_time: '09:00', close_time: '12:00' }],
      busy: [{ start_time: '11:00', end_time: '11:15' }],
    });

    // Studio booking: only needs its own 15 minutes, 10:45 is fine.
    const studioSlots = await getAvailableSlots(dataSource, FUTURE_DATE, 15, false, 30);
    expect(studioSlots).toContain('10:45');

    // À-domicile booking: needs the 30-minute buffer on top too, so a slot
    // ending right before the existing reservation is no longer safe.
    const homeSlots = await getAvailableSlots(dataSource, FUTURE_DATE, 15, true, 30);
    expect(homeSlots).not.toContain('10:45');
  });

  it('reserves travel time at the very start/end of the open window for an à-domicile booking, even with no other bookings that day', async () => {
    // This is the bug the admin actually hit: a day opened 09:00–19:00
    // must not offer a 09:00 à-domicile slot — she needs the 30-minute
    // buffer just to physically get there first.
    const dataSource = fakeDataSource({
      isClosed: false,
      ranges: [{ open_time: '09:00', close_time: '19:00' }],
    });

    const homeSlots = await getAvailableSlots(dataSource, FUTURE_DATE, 30, true, 30);
    expect(homeSlots).not.toContain('09:00');
    expect(homeSlots).not.toContain('09:15');
    expect(homeSlots).toContain('09:30');
    // Symmetric on the other edge: the appointment (30 min) must END with
    // 30 min still free before closing at 19:00, so the last bookable
    // start is 18:00 (ends 18:30), not 18:15 or 18:30.
    expect(homeSlots).not.toContain('18:30');
    expect(homeSlots).not.toContain('18:15');
    expect(homeSlots).toContain('18:00');

    // A studio booking on the very same day is unaffected by the buffer.
    const studioSlots = await getAvailableSlots(dataSource, FUTURE_DATE, 30, false, 30);
    expect(studioSlots).toContain('09:00');
    expect(studioSlots).toContain('18:30');
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

  it('à-domicile also needs the travel buffer counted from right now, not just "not yet past"', async () => {
    // 11:32 now — a home visit can't start at 11:45 (only 13 min notice for
    // a 30-min trip); the first honest slot is 12:15.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T11:32:00'));
    const dataSource = fakeDataSource({ isClosed: false, ranges: [{ open_time: '09:00', close_time: '19:00' }] });

    const slots = await getAvailableSlots(dataSource, '2026-08-01', 15, true, 30);

    expect(slots).not.toContain('11:45');
    expect(slots).not.toContain('12:00');
    expect(slots).toContain('12:15');

    jest.useRealTimers();
  });
});
