import { useMemo, useState } from 'react';

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Month grid of the filtered reservations (status filter from the parent
// still applies) — click a day to see its full detail (with the usual
// status/refuse/delete actions) in the table rendered below by the parent.
export default function ReservationsCalendar({ reservations, selectedDate, onSelectDate }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const byDate = useMemo(() => {
    const map = new Map();
    for (const r of reservations) {
      const list = map.get(r.reservation_date) ?? [];
      list.push(r);
      map.set(r.reservation_date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [reservations]);

  const { year, month } = cursor;
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  function prevMonth() {
    setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }));
  }
  function nextMonth() {
    setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }));
  }

  const now = new Date();
  const todayStr = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <div className="reservations-calendar">
      <div className="calendar-nav">
        <button type="button" className="btn btn-outline btn-sm" onClick={prevMonth} aria-label="Mois précédent">&larr;</button>
        <h3>{MONTH_NAMES[month]} {year}</h3>
        <button type="button" className="btn btn-outline btn-sm" onClick={nextMonth} aria-label="Mois suivant">&rarr;</button>
      </div>

      <div className="calendar-grid calendar-weekdays" aria-hidden="true">
        {DAY_NAMES.map((d) => <span key={d}>{d}</span>)}
      </div>

      <div className="calendar-grid">
        {cells.map((d, i) => {
          if (d === null) return <div key={`empty-${i}`} className="calendar-cell is-empty" />;

          const dateStr = toDateStr(year, month, d);
          const dayReservations = byDate.get(dateStr) ?? [];
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const visible = dayReservations.slice(0, 3);
          const extra = dayReservations.length - visible.length;

          return (
            <button
              type="button"
              key={dateStr}
              className={`calendar-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''} ${dayReservations.length ? 'has-reservations' : ''}`}
              onClick={() => onSelectDate(dateStr)}
            >
              <span className="calendar-cell-num">{d}</span>
              <div className="calendar-cell-chips">
                {visible.map((r) => (
                  <span key={r.id} className={`calendar-chip status-${r.status}`}>{r.start_time} {r.client_name}</span>
                ))}
                {extra > 0 && <span className="calendar-chip-more">+{extra}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
