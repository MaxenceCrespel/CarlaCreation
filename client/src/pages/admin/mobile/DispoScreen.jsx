import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../api/client';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import { Badge, Chips, ErrorText, Loading, Sheet, Switch, TopBar } from './ui';
import { capitalize, DAY_NAMES, DAY_SHORT, formatDayLong, MONTH_SHORT, parseDate, plural, rangesLabel, STATUS_TONE, toMinutes, todayStr } from './helpers';
import { STATUS_LABELS } from '../reservationUtils';

const MAX_RANGES = 6;
let keySeq = 0;
const withKeys = (ranges) => ranges.map((r) => ({ key: (keySeq += 1), openTime: r.openTime, closeTime: r.closeTime }));

function editorFrom(day) {
  const open = day.isSet && !day.isClosed && day.ranges.length > 0;
  return { open, ranges: withKeys(day.ranges.length ? day.ranges : [{ openTime: '09:00', closeTime: '19:00' }]) };
}

function payloadFrom(editor) {
  return {
    isClosed: !editor.open,
    ranges: editor.open ? editor.ranges.map((r) => ({ openTime: r.openTime, closeTime: r.closeTime })) : [],
  };
}

function validate(editor) {
  if (!editor.open) return null;
  const sorted = [...editor.ranges].sort((a, b) => a.openTime.localeCompare(b.openTime));
  for (let i = 0; i < sorted.length; i += 1) {
    if (!sorted[i].openTime || !sorted[i].closeTime || toMinutes(sorted[i].closeTime) <= toMinutes(sorted[i].openTime)) {
      return 'Chaque plage doit finir après son heure de début.';
    }
    if (i > 0 && sorted[i].openTime < sorted[i - 1].closeTime) return 'Les plages ne doivent pas se chevaucher.';
  }
  return null;
}

function chipLabel(day) {
  if (!day.isSet) return 'Fermé';
  if (day.isClosed || day.ranges.length === 0) return 'Fermé';
  return `${Number(day.ranges[0].openTime.slice(0, 2))}h–${Number(day.ranges[day.ranges.length - 1].closeTime.slice(0, 2))}h`;
}

// Applique les horaires du jour choisi à plusieurs autres jours d'un coup
// (raccourcis « tous les mercredis », « du lundi au samedi »…).
function CopySheet({ source, editor, days, reservations, onClose, onApply }) {
  const [selected, setSelected] = useState({});
  const [applying, setApplying] = useState(false);
  const others = days.filter((d) => d.date !== source.date);
  const sourceDow = parseDate(source.date).getDay();
  const count = Object.values(selected).filter(Boolean).length;
  const summary = editor.open ? rangesLabel(editor.ranges) : 'Fermé';

  const pick = (dates) => setSelected(Object.fromEntries(dates.map((d) => [d, true])));

  async function apply() {
    setApplying(true);
    await onApply(Object.keys(selected).filter((d) => selected[d]));
    setApplying(false);
  }

  return (
    <Sheet
      title="Appliquer à d'autres jours"
      onClose={onClose}
      left={{ label: 'Annuler', onClick: onClose }}
      tall
      footer={
        <>
          <p className="m-hint">Les horaires des jours cochés sont remplacés. Les rendez-vous déjà pris ne sont pas modifiés.</p>
          <button type="button" className="m-btn m-btn-primary m-btn-block" disabled={!count || applying} onClick={apply}>
            {applying ? 'Application…' : count ? `Appliquer à ${plural(count, 'jour', 'jours')}` : 'Cochez au moins un jour'}
          </button>
        </>
      }
    >
      <div className="m-recap">
        <span className="m-muted">Horaires du {formatDayLong(source.date).toLowerCase()}</span>
        <strong>{summary}</strong>
      </div>
      <div className="m-chips">
        <button type="button" className="m-chip" onClick={() => pick(others.filter((d) => parseDate(d.date).getDay() === sourceDow).map((d) => d.date))}>
          Tous les {DAY_NAMES[sourceDow].toLowerCase()}s
        </button>
        <button type="button" className="m-chip" onClick={() => pick(others.filter((d) => parseDate(d.date).getDay() !== 0).slice(0, 13).map((d) => d.date))}>
          Les 2 prochaines semaines (hors dimanche)
        </button>
        <button type="button" className="m-chip" onClick={() => pick([])}>Tout décocher</button>
      </div>
      <div className="m-card m-list">
        {others.map((d) => {
          const on = Boolean(selected[d.date]);
          const n = (reservations ?? []).filter((r) => r.reservation_date === d.date && (r.status === 'pending' || r.status === 'confirmed')).length;
          return (
            <button
              key={d.date}
              type="button"
              role="checkbox"
              aria-checked={on}
              className="m-list-item m-check-row"
              onClick={() => setSelected((s) => ({ ...s, [d.date]: !s[d.date] }))}
            >
              <span className={`m-checkbox ${on ? 'is-on' : ''}`} aria-hidden="true">{on ? '✓' : ''}</span>
              <span className="m-grow">
                <strong>{capitalize(formatDayLong(d.date))}</strong>
                <span className="m-muted">Actuellement : {d.isSet && !d.isClosed && d.ranges.length ? rangesLabel(d.ranges) : 'fermé'}</span>
              </span>
              {n > 0 && <Badge tone="wait">{plural(n, 'rdv', 'rdv')}</Badge>}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

// Ouverture des journées une par une (il n'y a pas d'horaire récurrent :
// un jour reste fermé tant qu'il n'a pas été ouvert ici).
export default function DispoScreen({ onBack, reservations }) {
  const confirm = useConfirm();
  const showToast = useToast();
  const [days, setDays] = useState(null);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [filter, setFilter] = useState('all');

  function load() {
    setError(null);
    return apiFetch('/admin/settings/daily-hours')
      .then((data) => {
        setDays(data.days);
        setSelectedDate((current) => current || data.days[0]?.date || null);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  const day = days?.find((d) => d.date === selectedDate) || null;

  useEffect(() => {
    if (day) setEditor(editorFrom(day));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, days]);

  const dirty = useMemo(() => {
    if (!day || !editor) return false;
    return JSON.stringify(payloadFrom(editor)) !== JSON.stringify(payloadFrom(editorFrom(day)));
  }, [day, editor]);

  const dayRdv = (reservations ?? [])
    .filter((r) => r.reservation_date === selectedDate && ['pending', 'confirmed', 'completed'].includes(r.status))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  function applyLocal(date, payload) {
    setDays((rows) => rows.map((d) => (d.date === date ? { ...d, isSet: true, ...payload } : d)));
  }

  async function save() {
    const problem = validate(editor);
    if (problem) {
      showToast(problem, 'error');
      return false;
    }
    setSaving(true);
    try {
      const payload = payloadFrom(editor);
      await apiFetch(`/admin/settings/daily-hours/${selectedDate}`, { method: 'PUT', body: payload });
      applyLocal(selectedDate, payload);
      showToast(`Horaires du ${formatDayLong(selectedDate).toLowerCase()} enregistrés.`, 'success');
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!(await confirm({ title: 'Réinitialiser ce jour ?', message: 'Il redevient « non défini », donc fermé.', confirmLabel: 'Réinitialiser', danger: false }))) return;
    try {
      await apiFetch(`/admin/settings/daily-hours/${selectedDate}`, { method: 'DELETE' });
      showToast('Jour réinitialisé (fermé).', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function applyTo(dates) {
    const problem = validate(editor);
    if (problem) {
      showToast(problem, 'error');
      return;
    }
    if (dirty && !(await save())) return;
    const payload = payloadFrom(editor);
    const failed = [];
    for (const date of dates) {
      try {
        await apiFetch(`/admin/settings/daily-hours/${date}`, { method: 'PUT', body: payload });
        applyLocal(date, payload);
      } catch {
        failed.push(date);
      }
    }
    setCopyOpen(false);
    if (failed.length) showToast(`Impossible de modifier ${plural(failed.length, 'jour', 'jours')}.`, 'error');
    else showToast(`Horaires appliqués à ${plural(dates.length, 'jour', 'jours')}.`, 'success');
  }

  const updateRange = (key, patch) => setEditor((e) => ({ ...e, ranges: e.ranges.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  const removeRange = (key) => setEditor((e) => ({ ...e, ranges: e.ranges.length > 1 ? e.ranges.filter((r) => r.key !== key) : e.ranges }));
  const addRange = () =>
    setEditor((e) => {
      if (e.ranges.length >= MAX_RANGES) return e;
      const last = e.ranges[e.ranges.length - 1];
      const start = last && last.closeTime < '20:00' ? last.closeTime : '14:00';
      const end = `${String(Math.min(23, Number(start.slice(0, 2)) + 2)).padStart(2, '0')}:${start.slice(3)}`;
      return { ...e, ranges: [...e.ranges, ...withKeys([{ openTime: start, closeTime: end }])] };
    });

  const today = todayStr();
  const shownDays = (days ?? []).filter((d) => {
    if (filter === 'open') return d.isSet && !d.isClosed && d.ranges.length > 0;
    if (filter === 'closed') return !(d.isSet && !d.isClosed && d.ranges.length > 0);
    return true;
  });

  return (
    <div className="m-screen m-has-savebar">
      <TopBar
        title="Disponibilités"
        back={{ label: 'Plus', onClick: onBack }}
        subtitle="Ouvrez chaque journée : les créneaux proposés en ligne en découlent. Un jour non ouvert reste fermé."
      />

      {error && <ErrorText>{error}</ErrorText>}
      {!error && !days && <Loading />}

      {days && (
        <>
          <Chips
            label="Filtrer les jours"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: '60 prochains jours' },
              { value: 'open', label: 'Ouverts' },
              { value: 'closed', label: 'Fermés' },
            ]}
          />
          <div className="m-days" role="group" aria-label="Choisir un jour">
            {shownDays.map((d) => {
              const date = parseDate(d.date);
              const isOpen = d.isSet && !d.isClosed && d.ranges.length > 0;
              return (
                <button
                  key={d.date}
                  type="button"
                  aria-pressed={d.date === selectedDate}
                  className={`m-day-chip ${isOpen ? '' : 'is-closed'} ${d.date === selectedDate ? 'is-on' : ''}`}
                  onClick={() => setSelectedDate(d.date)}
                >
                  <span className="m-muted">{d.date === today ? 'Auj.' : DAY_SHORT[date.getDay()]}</span>
                  <strong>{date.getDate()}</strong>
                  <span className="m-day-chip-month">{MONTH_SHORT[date.getMonth()]}</span>
                  <span className="m-day-chip-hours">{chipLabel(d)}</span>
                </button>
              );
            })}
          </div>

          {day && editor && (
            <section className="m-card m-card-pad m-day-editor">
              <div className="m-switch-row">
                <span>
                  <strong className="m-block m-day-editor-title">{capitalize(formatDayLong(day.date))}</strong>
                  <span className="m-muted">
                    {!day.isSet ? 'Non défini (fermé par défaut)' : editor.open ? 'Ouverte aux réservations' : 'Fermée'}
                  </span>
                </span>
                <Switch checked={editor.open} label="Journée ouverte" onChange={(open) => setEditor((e) => ({ ...e, open }))} />
              </div>

              {editor.open ? (
                <>
                  {editor.ranges.map((r, i) => (
                    <div key={r.key} className="m-range">
                      <div className="m-range-head">
                        <span className="m-eyebrow">Plage {i + 1}</span>
                        {editor.ranges.length > 1 && (
                          <button type="button" className="m-link m-link-sm m-link-danger" onClick={() => removeRange(r.key)}>Retirer</button>
                        )}
                      </div>
                      <div className="m-range-times">
                        <input type="time" aria-label={`Début de la plage ${i + 1}`} value={r.openTime} onChange={(e) => updateRange(r.key, { openTime: e.target.value })} />
                        <span aria-hidden="true">→</span>
                        <input type="time" aria-label={`Fin de la plage ${i + 1}`} value={r.closeTime} onChange={(e) => updateRange(r.key, { closeTime: e.target.value })} />
                      </div>
                    </div>
                  ))}
                  {editor.ranges.length < MAX_RANGES && (
                    <button type="button" className="m-btn m-btn-block" onClick={addRange}>+ Ajouter une plage (pause déjeuner…)</button>
                  )}
                </>
              ) : (
                <p className="m-muted">Aucun créneau ne sera proposé aux clientes ce jour-là.</p>
              )}
              {day.isSet && (
                <button type="button" className="m-link m-link-sm m-link-muted" onClick={reset}>Réinitialiser ce jour</button>
              )}
            </section>
          )}

          {day && editor && (
            <button type="button" className="m-card m-copy-card" onClick={() => setCopyOpen(true)}>
              <span className="m-copy-icon" aria-hidden="true">⧉</span>
              <span className="m-grow">
                <strong className="m-block">Appliquer « {editor.open ? rangesLabel(editor.ranges) : 'Fermé'} » à d'autres jours</strong>
                <span className="m-muted">Pour ne pas ressaisir les mêmes horaires jour par jour</span>
              </span>
            </button>
          )}

          {day && (
            <section className="m-section">
              <h2 className="m-section-title m-section-title-sm">Rendez-vous ce jour-là</h2>
              {dayRdv.length === 0 ? (
                <p className="m-muted">Aucun rendez-vous.</p>
              ) : (
                <div className="m-card m-list">
                  {dayRdv.map((r) => (
                    <div key={r.id} className="m-list-item">
                      <strong className="m-time-inline">{r.start_time}</strong>
                      <span className="m-grow m-ellipsis">{r.client_name} · <span className="m-muted">{r.service_name}</span></span>
                      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                    </div>
                  ))}
                </div>
              )}
              {dayRdv.length > 0 && !editor?.open && (
                <p className="m-warning">Fermer ce jour n'annule pas ses rendez-vous : prévenez les clientes concernées.</p>
              )}
            </section>
          )}
        </>
      )}

      {dirty && (
        <div className="m-savebar">
          <button type="button" className="m-btn" onClick={() => setEditor(editorFrom(day))} disabled={saving}>Annuler</button>
          <button type="button" className="m-btn m-btn-primary" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      )}

      {copyOpen && day && editor && (
        <CopySheet
          source={day}
          editor={editor}
          days={days}
          reservations={reservations}
          onClose={() => setCopyOpen(false)}
          onApply={applyTo}
        />
      )}
    </div>
  );
}
