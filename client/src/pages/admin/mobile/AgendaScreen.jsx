import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../../api/client';
import { STATUS_LABELS } from '../reservationUtils';
import { Badge, Chips, Empty, ErrorText, Icon, Loading, SearchField, Segmented } from './ui';
import {
  addDays,
  capitalize,
  DAY_NAMES,
  formatDayLong,
  fromMinutes,
  mondayIndex,
  monthLabel,
  MONTH_NAMES,
  parseDate,
  plural,
  rangesLabel,
  shiftMonth,
  STATUS_TONE,
  toMinutes,
  todayStr,
} from './helpers';

// Agenda façon Calendrier de l'iPhone : vue Jour (frise de la semaine +
// grille horaire), vue Mois (points sous les jours occupés + liste du jour
// choisi) et vue Liste (filtres et recherche).

const HOUR_PX = 56;
const VISIBLE = ['pending', 'confirmed', 'completed'];
const WEEK_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function byTime(a, b) {
  return (a.reservation_date + a.start_time).localeCompare(b.reservation_date + b.start_time);
}

// Side-by-side columns for overlapping appointments (rare, but allowed with
// "autoriser le chevauchement"): greedy lanes inside each overlap cluster.
function layoutEvents(events) {
  const sorted = [...events].sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
  const result = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    cluster.forEach((e) => {
      const start = toMinutes(e.start_time);
      let lane = lanes.findIndex((end) => end <= start);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(0);
      }
      lanes[lane] = toMinutes(e.end_time);
      result.push({ r: e, lane });
    });
    const count = lanes.length;
    result.slice(result.length - cluster.length).forEach((x) => {
      x.lanes = count;
    });
    cluster = [];
    clusterEnd = -1;
  };
  sorted.forEach((e) => {
    if (cluster.length && toMinutes(e.start_time) >= clusterEnd) flush();
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, toMinutes(e.end_time));
  });
  if (cluster.length) flush();
  return result;
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function DayView({ day, setDay, events, hours, rdv }) {
  const now = useNow();
  const today = todayStr();
  const touch = useRef(null);
  const ranges = hours?.ranges ?? [];
  const minuteMarks = [
    ...ranges.flatMap((r) => [toMinutes(r.openTime), toMinutes(r.closeTime)]),
    ...events.flatMap((e) => [toMinutes(e.start_time), toMinutes(e.end_time)]),
  ];
  const startH = Math.max(0, Math.min(8, ...minuteMarks.map((m) => Math.floor(m / 60))));
  const endH = Math.min(24, Math.max(20, ...minuteMarks.map((m) => Math.ceil(m / 60))));
  const top = (minutes) => ((minutes - startH * 60) / 60) * HOUR_PX;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const laidOut = layoutEvents(events);

  function onTouchStart(e) {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e) {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) setDay(addDays(day, dx < 0 ? 1 : -1));
  }

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {hours && !hours.isClosed && ranges.length > 0 && (
        <p className="m-day-hours">Ouvert {rangesLabel(ranges)}</p>
      )}
      {hours && (hours.isClosed || ranges.length === 0) && (
        <p className="m-day-closed">Journée fermée aux réservations en ligne</p>
      )}
      <div className="m-timeline" style={{ height: (endH - startH) * HOUR_PX }}>
        {ranges.map((r) => (
          <div
            key={r.openTime}
            className="m-timeline-open"
            style={{ top: top(toMinutes(r.openTime)), height: top(toMinutes(r.closeTime)) - top(toMinutes(r.openTime)) }}
          />
        ))}
        {Array.from({ length: endH - startH }, (_, i) => startH + i).map((h) => (
          <button
            key={h}
            type="button"
            className="m-slot"
            style={{ top: (h - startH) * HOUR_PX }}
            aria-label={`Créer un rendez-vous à ${h}h`}
            onClick={() => rdv.create({ date: day, startTime: fromMinutes(h * 60) })}
          >
            <span className="m-slot-label">{h}:00</span>
          </button>
        ))}
        {day === today && nowMinutes >= startH * 60 && nowMinutes <= endH * 60 && (
          <div className="m-now" style={{ top: top(nowMinutes) }} aria-hidden="true">
            <span>{fromMinutes(nowMinutes)}</span>
          </div>
        )}
        {laidOut.map(({ r, lane, lanes }) => {
          const height = Math.max(26, top(toMinutes(r.end_time)) - top(toMinutes(r.start_time)) - 2);
          return (
            <button
              key={r.id}
              type="button"
              className={`m-event m-event-${r.status}`}
              style={{
                top: top(toMinutes(r.start_time)),
                height,
                left: `calc(52px + (100% - 58px) * ${lane / lanes})`,
                width: `calc((100% - 58px) / ${lanes} - 2px)`,
              }}
              onClick={() => rdv.open(r.id)}
            >
              <strong className="m-ellipsis">{r.client_name}</strong>
              {height >= 48 && <span className="m-ellipsis">{r.service_name}</span>}
              <span className="m-ellipsis">
                {r.start_time} – {r.end_time} · {r.at_client_home ? 'Domicile' : 'Studio'}
                {r.status === 'pending' ? ' · à valider' : ''}
              </span>
            </button>
          );
        })}
      </div>
      <p className="m-hint">Touchez une heure libre pour créer un rendez-vous. Glissez à gauche ou à droite pour changer de jour.</p>
    </div>
  );
}

function MonthView({ day, setDay, cursor, setCursor, list, hoursByDate, rdv, toDay }) {
  const today = todayStr();
  const [y, m] = cursor.split('-').map(Number);
  const first = `${cursor}-01`;
  const daysInMonth = new Date(y, m, 0).getDate();
  const blanks = mondayIndex(first);
  const cells = [
    ...Array.from({ length: blanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${cursor}-${String(i + 1).padStart(2, '0')}`),
  ];
  const selected = list.filter((r) => r.reservation_date === day).sort(byTime);

  return (
    <>
      <div className="m-month-nav">
        <button type="button" className="m-round-btn" aria-label="Mois précédent" onClick={() => setCursor(shiftMonth(cursor, -1))}><Icon name="back" size={20} /></button>
        <strong>{monthLabel(cursor)}</strong>
        <button type="button" className="m-round-btn" aria-label="Mois suivant" onClick={() => setCursor(shiftMonth(cursor, 1))}><Icon name="next" size={20} /></button>
      </div>
      <div className="m-month">
        {WEEK_LETTERS.map((l, i) => <span key={i} className="m-month-wd">{l}</span>)}
        {cells.map((date, i) => {
          if (!date) return <span key={`b${i}`} />;
          const events = list.filter((r) => r.reservation_date === date);
          const hasPending = events.some((r) => r.status === 'pending');
          const hours = hoursByDate[date];
          const closed = hours && (hours.isClosed || hours.ranges.length === 0);
          return (
            <button
              key={date}
              type="button"
              className={`m-month-day ${date === today ? 'is-today' : ''} ${date === day ? 'is-on' : ''} ${closed ? 'is-closed' : ''}`}
              aria-pressed={date === day}
              aria-label={`${formatDayLong(date)}${events.length ? `, ${plural(events.length, 'rendez-vous', 'rendez-vous')}` : ''}`}
              onClick={() => setDay(date)}
            >
              <span className="m-month-num">{Number(date.slice(-2))}</span>
              <span className={`m-mdot ${events.length ? (hasPending ? 'is-wait' : '') : 'is-none'}`} />
            </button>
          );
        })}
      </div>
      <section className="m-section">
        <div className="m-section-head">
          <h2 className="m-section-title">{capitalize(formatDayLong(day))}</h2>
          <button type="button" className="m-link m-link-sm" onClick={toDay}>Voir la journée ›</button>
        </div>
        {selected.length === 0 ? (
          <Empty>{hoursByDate[day] && hoursByDate[day].isClosed ? 'Journée fermée.' : 'Aucun rendez-vous.'}</Empty>
        ) : (
          <div className="m-card m-list">
            {selected.map((r) => <RdvRow key={r.id} r={r} onClick={() => rdv.open(r.id)} />)}
          </div>
        )}
      </section>
    </>
  );
}

function RdvRow({ r, onClick, showPlace = false }) {
  return (
    <button type="button" className="m-list-item m-rdv-row" onClick={onClick}>
      <span className={`m-bar m-bar-${r.status}`} aria-hidden="true" />
      <span className="m-time">
        <strong>{r.start_time}</strong>
        <span className="m-muted">{r.end_time}</span>
      </span>
      <span className="m-grow">
        <strong className="m-ellipsis">{r.client_name}</strong>
        <span className="m-muted m-ellipsis">{r.service_name}{showPlace ? ` · ${r.at_client_home ? 'Domicile' : 'Studio'}` : ''}</span>
      </span>
      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABELS[r.status]}</Badge>
    </button>
  );
}

const LIST_FILTERS = [
  { value: 'upcoming', label: 'À venir' },
  { value: 'pending', label: 'En attente' },
  { value: 'past', label: 'Passés' },
  { value: 'cancelled', label: 'Annulés / refusés' },
];

function ListView({ all, rdv }) {
  const [filter, setFilter] = useState('upcoming');
  const [search, setSearch] = useState('');
  const today = todayStr();

  const tests = {
    upcoming: (r) => r.reservation_date >= today && (r.status === 'pending' || r.status === 'confirmed'),
    pending: (r) => r.status === 'pending',
    past: (r) => r.reservation_date < today && (r.status === 'confirmed' || r.status === 'completed'),
    cancelled: (r) => r.status === 'cancelled' || r.status === 'refused',
  };
  const needle = search.trim().toLowerCase();
  const digits = search.replace(/\D/g, '');
  let rows = all.filter(tests[filter]);
  if (needle) {
    rows = rows.filter(
      (r) =>
        [r.client_name, r.client_email, r.client_phone, r.notes, r.service_name, r.client_address]
          .filter(Boolean)
          .some((f) => f.toLowerCase().includes(needle)) ||
        (digits.length >= 3 && (r.client_phone || '').replace(/\D/g, '').includes(digits)),
    );
  }
  rows.sort(byTime);
  if (filter === 'past' || filter === 'cancelled') rows.reverse();

  const days = [];
  rows.forEach((r) => {
    const last = days[days.length - 1];
    if (last && last.date === r.reservation_date) last.rows.push(r);
    else days.push({ date: r.reservation_date, rows: [r] });
  });

  return (
    <div className="m-screen m-screen-tight">
      <SearchField id="m-rdv-search" label="Rechercher un rendez-vous" placeholder="Nom, téléphone, email, note…" value={search} onChange={setSearch} />
      <Chips
        label="Filtrer les rendez-vous"
        value={filter}
        onChange={setFilter}
        options={LIST_FILTERS.map((f) => ({ ...f, count: all.filter(tests[f.value]).length }))}
      />
      {days.length === 0 && <Empty>Aucun rendez-vous pour ce filtre.</Empty>}
      {days.map((d) => (
        <section key={d.date} className="m-section">
          <h2 className="m-section-title m-section-title-sm">
            {d.date === today ? "Aujourd'hui · " : d.date === addDays(today, 1) ? 'Demain · ' : ''}
            {capitalize(formatDayLong(d.date))}
            {d.date.slice(0, 4) !== today.slice(0, 4) ? ` ${d.date.slice(0, 4)}` : ''}
          </h2>
          <div className="m-card m-list">
            {d.rows.map((r) => <RdvRow key={r.id} r={r} showPlace onClick={() => rdv.open(r.id)} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function AgendaScreen({ rdv, state, setState }) {
  const [hoursByDate, setHoursByDate] = useState({});
  const [cursor, setCursor] = useState(state.day.slice(0, 7));
  const { mode, day } = state;
  const today = todayStr();

  useEffect(() => {
    apiFetch('/admin/settings/daily-hours')
      .then((data) => setHoursByDate(Object.fromEntries(data.days.map((d) => [d.date, d]))))
      .catch(() => {});
  }, []);

  const all = useMemo(() => rdv.list ?? [], [rdv.list]);
  const visible = useMemo(() => all.filter((r) => VISIBLE.includes(r.status)), [all]);
  const dayEvents = visible.filter((r) => r.reservation_date === day);

  const setDay = (d) => {
    setState((s) => ({ ...s, day: d }));
    setCursor(d.slice(0, 7));
  };
  const setMode = (m) => setState((s) => ({ ...s, mode: m }));

  const weekStart = addDays(day, -mondayIndex(day));
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const pendingOfDay = dayEvents.filter((r) => r.status === 'pending').length;
  const d = parseDate(day);

  return (
    <div className="m-agenda">
      <header className="m-topbar m-agenda-top">
        <div className="m-topbar-row">
          {mode === 'day' ? (
            <button type="button" className="m-link m-back" onClick={() => setMode('month')}>
              <Icon name="back" size={22} />
              {capitalize(MONTH_NAMES[d.getMonth()])}
            </button>
          ) : (
            <h1 className="m-title m-title-inline">{mode === 'month' ? 'Calendrier' : 'Rendez-vous'}</h1>
          )}
          <button type="button" className="m-link" onClick={() => setDay(today)} disabled={day === today && mode === 'day'}>Aujourd’hui</button>
        </div>
        <Segmented
          label="Affichage de l'agenda"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'day', label: 'Jour' },
            { value: 'month', label: 'Mois' },
            { value: 'list', label: 'Liste' },
          ]}
        />
        {mode === 'day' && (
          <>
            <div className="m-week" role="group" aria-label="Semaine">
              {week.map((date, i) => {
                const events = visible.filter((r) => r.reservation_date === date);
                const hours = hoursByDate[date];
                const closed = hours && (hours.isClosed || hours.ranges.length === 0);
                return (
                  <button
                    key={date}
                    type="button"
                    className={`m-week-day ${date === today ? 'is-today' : ''} ${date === day ? 'is-on' : ''} ${closed ? 'is-closed' : ''}`}
                    aria-pressed={date === day}
                    aria-label={`${formatDayLong(date)}${events.length ? `, ${plural(events.length, 'rendez-vous', 'rendez-vous')}` : ''}`}
                    onClick={() => setDay(date)}
                  >
                    <span className="m-week-letter">{WEEK_LETTERS[i]}</span>
                    <span className="m-week-num">{Number(date.slice(-2))}</span>
                    <span className={`m-mdot ${events.length ? (events.some((r) => r.status === 'pending') ? 'is-wait' : '') : 'is-none'}`} />
                  </button>
                );
              })}
            </div>
            <div className="m-day-nav">
              <button type="button" className="m-round-btn" aria-label="Jour précédent" onClick={() => setDay(addDays(day, -1))}><Icon name="back" size={20} /></button>
              <div className="m-day-nav-label">
                <strong>{day === today ? "Aujourd'hui · " : ''}{DAY_NAMES[d.getDay()]} {d.getDate()} {MONTH_NAMES[d.getMonth()]}</strong>
                <span className="m-muted">
                  {dayEvents.length === 0 ? 'Aucun rendez-vous' : plural(dayEvents.length, 'rendez-vous', 'rendez-vous')}
                  {pendingOfDay > 0 ? ` · ${pendingOfDay} à valider` : ''}
                </span>
              </div>
              <button type="button" className="m-round-btn" aria-label="Jour suivant" onClick={() => setDay(addDays(day, 1))}><Icon name="next" size={20} /></button>
            </div>
          </>
        )}
      </header>

      {rdv.error && <ErrorText>{rdv.error}</ErrorText>}
      {!rdv.error && !rdv.list && <Loading />}

      {rdv.list && mode === 'day' && <DayView day={day} setDay={setDay} events={dayEvents} hours={hoursByDate[day]} rdv={rdv} />}
      {rdv.list && mode === 'month' && (
        <MonthView
          day={day}
          setDay={setDay}
          cursor={cursor}
          setCursor={setCursor}
          list={visible}
          hoursByDate={hoursByDate}
          rdv={rdv}
          toDay={() => setMode('day')}
        />
      )}
      {rdv.list && mode === 'list' && <ListView all={all} rdv={rdv} />}
    </div>
  );
}
