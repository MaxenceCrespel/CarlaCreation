const SLOT_STEP_MINUTES = 15;

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function isValidDateString(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

// Returns available start times (HH:MM) for a given date and service duration,
// excluding slots that overlap existing (non-cancelled) reservations, past
// times, and days that are closed (weekly schedule or a specific blackout date).
// Opening hours and blackout dates are admin-editable and stored in the DB.
function getAvailableSlots(db, dateStr, durationMinutes) {
  if (!isValidDateString(dateStr)) return [];

  const blackout = db.prepare('SELECT date FROM blackout_dates WHERE date = ?').get(dateStr);
  if (blackout) return [];

  const date = new Date(`${dateStr}T00:00:00`);
  const dayOfWeek = date.getDay();
  const hours = db.prepare('SELECT is_closed, open_time, close_time FROM opening_hours WHERE day_of_week = ?').get(dayOfWeek);
  if (!hours || hours.is_closed || !hours.open_time || !hours.close_time) return [];

  const openMin = toMinutes(hours.open_time);
  const closeMin = toMinutes(hours.close_time);

  const existing = db
    .prepare(
      `SELECT start_time, end_time FROM reservations
       WHERE reservation_date = ? AND status != 'cancelled'`
    )
    .all(dateStr);

  const busy = existing.map((r) => ({
    start: toMinutes(r.start_time),
    end: toMinutes(r.end_time),
  }));

  const now = new Date();
  const isToday = dateStr === now.toISOString().slice(0, 10);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const slots = [];
  for (let start = openMin; start + durationMinutes <= closeMin; start += SLOT_STEP_MINUTES) {
    const end = start + durationMinutes;
    if (isToday && start <= nowMinutes) continue;

    const overlaps = busy.some((b) => start < b.end && end > b.start);
    if (!overlaps) {
      slots.push(toHHMM(start));
    }
  }
  return slots;
}

module.exports = { getAvailableSlots, isValidDateString, toMinutes, toHHMM };
