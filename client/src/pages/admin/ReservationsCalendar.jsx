import { useMemo, useState } from 'react';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MONTH_NAMES = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

// Fixed 08:00–20:00 window, 30-minute rows — covers a normal working day;
// a reservation outside this range still renders, just clipped at the edge
// (rare in practice, and visible rather than silently hidden).
const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 20 * 60;
const ROW_MINUTES = 30;
const ROW_HEIGHT = 44; // px, keep in sync with .agenda-row-line height in CSS
const ROWS = (DAY_END_MIN - DAY_START_MIN) / ROW_MINUTES;

function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfWeek(date) {
  const d = new Date(date);
  const dow = (d.getDay() + 6) % 7; // Monday-first
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Weekly agenda (à la Planity) — days as columns, hours as rows, each
// reservation positioned as a block by its actual start/end time. Click a
// block (or the day header) to see that day's full detail (with the usual
// status/refuse/delete actions) in the table rendered below by the parent.
export default function ReservationsCalendar({ reservations, selectedDate, onSelectDate }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const byDate = useMemo(() => {
    const map = new Map();
    for (const r of reservations) {
      const list = map.get(r.reservation_date) ?? [];
      list.push(r);
      map.set(r.reservation_date, list);
    }
    return map;
  }, [reservations]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  function prevWeek() {
    setWeekStart((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() - 7);
      return next;
    });
  }
  function nextWeek() {
    setWeekStart((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + 7);
      return next;
    });
  }
  function goToday() {
    setWeekStart(startOfWeek(new Date()));
  }

  const todayStr = toDateStr(new Date());
  const rangeLabel = (() => {
    const first = days[0];
    const last = days[6];
    const sameMonth = first.getMonth() === last.getMonth();
    const firstLabel = `${first.getDate()}${sameMonth ? '' : ` ${MONTH_NAMES[first.getMonth()]}`}`;
    return `${firstLabel} – ${last.getDate()} ${MONTH_NAMES[last.getMonth()]} ${last.getFullYear()}`;
  })();

  return (
    <div className="reservations-calendar">
      <div className="calendar-nav">
        <button type="button" className="btn btn-outline btn-sm" onClick={prevWeek} aria-label="Semaine précédente">&larr;</button>
        <div className="calendar-nav-center">
          <h3>{rangeLabel}</h3>
          <button type="button" className="btn btn-outline btn-sm" onClick={goToday}>Aujourd'hui</button>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={nextWeek} aria-label="Semaine suivante">&rarr;</button>
      </div>

      <div className="agenda-scroll">
        <div className="agenda-grid" style={{ '--agenda-rows': ROWS, '--agenda-row-height': `${ROW_HEIGHT}px` }}>
          <div className="agenda-corner" />
          {days.map((d) => {
            const dateStr = toDateStr(d);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            return (
              <button
                type="button"
                key={dateStr}
                className={`agenda-day-header ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
                onClick={() => onSelectDate(dateStr)}
              >
                <span className="agenda-day-name">{DAY_NAMES[(d.getDay() + 6) % 7].slice(0, 3)}</span>
                <span className="agenda-day-num">{d.getDate()}</span>
              </button>
            );
          })}

          <div className="agenda-times">
            {Array.from({ length: ROWS }, (_, i) => {
              const minutes = DAY_START_MIN + i * ROW_MINUTES;
              const label = minutes % 60 === 0 ? `${String(Math.floor(minutes / 60)).padStart(2, '0')}:00` : '';
              return <div key={i} className="agenda-time-row">{label}</div>;
            })}
          </div>

          {days.map((d) => {
            const dateStr = toDateStr(d);
            const dayReservations = byDate.get(dateStr) ?? [];
            const isSelected = dateStr === selectedDate;
            return (
              <div key={dateStr} className={`agenda-day-column ${isSelected ? 'is-selected' : ''}`}>
                {Array.from({ length: ROWS }, (_, i) => <div key={i} className="agenda-row-line" />)}
                {dayReservations.map((r) => {
                  const start = Math.max(toMinutes(r.start_time), DAY_START_MIN);
                  const end = Math.min(toMinutes(r.end_time), DAY_END_MIN);
                  if (end <= DAY_START_MIN || start >= DAY_END_MIN) return null;
                  const top = ((start - DAY_START_MIN) / ROW_MINUTES) * ROW_HEIGHT;
                  const height = Math.max(((end - start) / ROW_MINUTES) * ROW_HEIGHT, 18);
                  return (
                    <button
                      type="button"
                      key={r.id}
                      className={`agenda-block status-${r.status}`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                      onClick={() => onSelectDate(dateStr)}
                      title={`${r.start_time}–${r.end_time} ${r.client_name} (${r.service_name})`}
                    >
                      <span className="agenda-block-time">{r.start_time}</span>
                      <span className="agenda-block-name">{r.client_name}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
