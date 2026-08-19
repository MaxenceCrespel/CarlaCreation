import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import CollapsibleCard from './CollapsibleCard';

const DAY_NAMES = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTH_NAMES = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MAX_RANGES = 6;

function formatDayLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAY_NAMES[date.getDay()]} ${d} ${MONTH_NAMES[m - 1]}`;
}
function formatShortDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1]}`;
}

let rangeKeySeq = 0;
function emptyRange() {
  rangeKeySeq += 1;
  return { key: rangeKeySeq, openTime: '09:00', closeTime: '19:00' };
}

// Editor panel for whichever single day is currently selected in the
// horizontal calendar strip above it. Supports several open ranges per day
// (e.g. 10:00–13:00 and 16:00–19:00 for a lunch break) instead of a single
// open/close pair.
function DayEditor({ day, onSave, onReset }) {
  const [isClosed, setIsClosed] = useState(day.isClosed);
  const [ranges, setRanges] = useState(() =>
    day.ranges.length > 0
      ? day.ranges.map((r) => ({ key: (rangeKeySeq += 1), openTime: r.openTime, closeTime: r.closeTime }))
      : [emptyRange()],
  );
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIsClosed(day.isClosed);
    setRanges(
      day.ranges.length > 0
        ? day.ranges.map((r) => ({ key: (rangeKeySeq += 1), openTime: r.openTime, closeTime: r.closeTime }))
        : [emptyRange()],
    );
    setFeedback('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.date]);

  function addRange() {
    if (ranges.length >= MAX_RANGES) return;
    setRanges((r) => [...r, emptyRange()]);
  }
  function removeRange(key) {
    setRanges((r) => r.filter((range) => range.key !== key));
  }
  function updateRange(key, patch) {
    setRanges((r) => r.map((range) => (range.key === key ? { ...range, ...patch } : range)));
  }

  async function save() {
    setFeedback('');
    setSaving(true);
    try {
      await onSave(day.date, {
        isClosed,
        ranges: isClosed ? [] : ranges.map((r) => ({ openTime: r.openTime, closeTime: r.closeTime })),
      });
      setFeedback('Enregistré ✓');
    } catch (err) {
      setFeedback(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setFeedback('');
    try {
      await onReset(day.date);
    } catch (err) {
      setFeedback(err.message);
    }
  }

  return (
    <div className="day-editor">
      <div className="day-editor-header">
        <h3>{formatDayLabel(day.date)}</h3>
        <span className={`hours-override-badge ${day.isSet ? 'is-custom' : ''}`}>
          {day.isSet ? (day.isClosed ? 'Fermé' : 'Ouvert') : 'Non défini (fermé par défaut)'}
        </span>
      </div>

      <label className="day-editor-closed">
        <input type="checkbox" checked={isClosed} onChange={(e) => setIsClosed(e.target.checked)} />
        Fermé ce jour-là
      </label>

      {!isClosed && (
        <div className="day-editor-ranges">
          {ranges.map((range, i) => (
            <div className="day-editor-range" key={range.key}>
              <div className="day-editor-times">
                <div className="form-row">
                  <label htmlFor={`range-open-${range.key}`}>Ouverture{ranges.length > 1 ? ` (créneau ${i + 1})` : ''}</label>
                  <input
                    type="time"
                    id={`range-open-${range.key}`}
                    value={range.openTime}
                    onChange={(e) => updateRange(range.key, { openTime: e.target.value })}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor={`range-close-${range.key}`}>Fermeture{ranges.length > 1 ? ` (créneau ${i + 1})` : ''}</label>
                  <input
                    type="time"
                    id={`range-close-${range.key}`}
                    value={range.closeTime}
                    onChange={(e) => updateRange(range.key, { closeTime: e.target.value })}
                  />
                </div>
              </div>
              {ranges.length > 1 && (
                <button type="button" className="range-remove-btn" onClick={() => removeRange(range.key)}>
                  Retirer ce créneau
                </button>
              )}
            </div>
          ))}
          {ranges.length < MAX_RANGES && (
            <button type="button" className="btn btn-outline btn-sm add-range-btn" onClick={addRange}>
              + Ajouter un créneau (ex : pause déjeuner)
            </button>
          )}
        </div>
      )}

      <div className="day-editor-actions">
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {day.isSet && (
          <button type="button" className="btn btn-outline" onClick={reset}>
            Réinitialiser (referme le jour)
          </button>
        )}
        {feedback && <span className="day-editor-feedback">{feedback}</span>}
      </div>
    </div>
  );
}

let tierKeySeq = 0;

// Carla is a solo auto-entrepreneuse: when a booking is à domicile, this
// many minutes get blocked before/after it (and at the edges of the day's
// open hours) so back-to-back bookings never ignore travel time. The travel
// fee itself is a step schedule by distance (e.g. free under 10km, +2€
// beyond) rather than a flat rate — clients see the free radius upfront on
// the booking page, so there's never a surprise fee added at the end.
function TravelBufferCard() {
  const showToast = useToast();
  const [minutes, setMinutes] = useState(null);
  const [fallbackFeeEuros, setFallbackFeeEuros] = useState(null);
  const [tiers, setTiers] = useState(null); // [{ key, minKm, feeEuros }]
  const [saving, setSaving] = useState(false);

  function load() {
    Promise.all([apiFetch('/admin/settings/travel-buffer'), apiFetch('/admin/settings/travel-fee')])
      .then(([buffer, fee]) => {
        setMinutes(buffer.minutes);
        setFallbackFeeEuros((fee.fallbackCents / 100).toString());
        setTiers(
          [...fee.tiers]
            .sort((a, b) => a.minKm - b.minKm)
            .map((t) => ({ key: (tierKeySeq += 1), minKm: t.minKm.toString(), feeEuros: (t.feeCents / 100).toString() })),
        );
      })
      .catch(() => showToast('Impossible de charger les réglages de trajet.', 'error'));
  }

  useEffect(load, []);

  function updateTier(key, patch) {
    setTiers((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addTier() {
    setTiers((rows) => [...rows, { key: (tierKeySeq += 1), minKm: '', feeEuros: '' }]);
  }
  function removeTier(key) {
    setTiers((rows) => rows.filter((r) => r.key !== key));
  }

  async function save(e) {
    e.preventDefault();
    if (!tiers.some((t) => Number(t.minKm) === 0)) {
      showToast('Il faut un palier à partir de 0 km (le rayon gratuit).', 'error');
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        apiFetch('/admin/settings/travel-buffer', { method: 'PUT', body: { minutes: Number(minutes) } }),
        apiFetch('/admin/settings/travel-fee/fallback', {
          method: 'PUT',
          body: { feeCents: Math.round(Number(fallbackFeeEuros) * 100) },
        }),
        apiFetch('/admin/settings/travel-fee/tiers', {
          method: 'PUT',
          body: { tiers: tiers.map((t) => ({ minKm: Number(t.minKm), feeCents: Math.round(Number(t.feeEuros) * 100) })) },
        }),
      ]);
      showToast('Réglages de trajet mis à jour.', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="travel-buffer-card" onSubmit={save}>
      <p className="section-lead">
        Le temps de trajet réel (calculé automatiquement à partir de l'adresse du client) est utilisé en priorité
        pour bloquer le planning avant/après un rendez-vous à domicile. Le frais de déplacement suit les paliers
        ci-dessous selon la distance réelle (ex : gratuit jusqu'à 10 km, puis 2 € au-delà) — le client voit le rayon
        gratuit avant même de saisir son adresse. Les valeurs ci-dessous ne servent que quand la distance est
        introuvable (adresse non reconnue, calcul indisponible).
      </p>
      {minutes === null || fallbackFeeEuros === null || tiers === null ? (
        <p className="loading-text">Chargement…</p>
      ) : (
        <>
          <div className="form-row two-col">
            <div>
              <label htmlFor="travel-buffer-minutes">Minutes bloquées avant/après (repli)</label>
              <input
                type="number"
                id="travel-buffer-minutes"
                min={0}
                max={240}
                step={5}
                required
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="travel-fee-fallback-euros">Frais de repli (€)</label>
              <input
                type="number"
                id="travel-fee-fallback-euros"
                min={0}
                max={100}
                step={0.5}
                required
                value={fallbackFeeEuros}
                onChange={(e) => setFallbackFeeEuros(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <label>Paliers de frais de déplacement</label>
            <div className="travel-fee-tiers">
              {tiers.map((t) => (
                <div className="travel-fee-tier-row" key={t.key}>
                  <span className="travel-fee-tier-label">À partir de</span>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    step={0.5}
                    required
                    value={t.minKm}
                    onChange={(e) => updateTier(t.key, { minKm: e.target.value })}
                    aria-label="Distance en km"
                  />
                  <span className="travel-fee-tier-label">km :</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    required
                    value={t.feeEuros}
                    onChange={(e) => updateTier(t.key, { feeEuros: e.target.value })}
                    aria-label="Frais en euros"
                  />
                  <span className="travel-fee-tier-label">€</span>
                  <button type="button" className="guest-remove-btn" onClick={() => removeTier(t.key)} disabled={tiers.length <= 1}>
                    Retirer
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={addTier} style={{ marginTop: 10 }}>
              + Ajouter un palier
            </button>
          </div>

          <div className="travel-buffer-save" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

export default function HoursTab() {
  const showToast = useToast();
  const [days, setDays] = useState(null);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  function load() {
    setError(null);
    apiFetch('/admin/settings/daily-hours')
      .then((data) => {
        setDays(data.days);
        setSelectedDate((current) => current || data.days[0]?.date || null);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function saveDay(date, payload) {
    await apiFetch(`/admin/settings/daily-hours/${date}`, { method: 'PUT', body: payload });
    showToast(`Horaires du ${formatDayLabel(date)} mis à jour.`, 'success');
    setDays((rows) => rows.map((d) => (d.date === date ? { ...d, isSet: true, ...payload } : d)));
  }

  async function resetDay(date) {
    await apiFetch(`/admin/settings/daily-hours/${date}`, { method: 'DELETE' });
    showToast(`Horaires du ${formatDayLabel(date)} réinitialisés (fermé par défaut).`, 'success');
    load();
  }

  const selectedDay = days?.find((d) => d.date === selectedDate) || null;

  return (
    <>
      <div className="card hours-editor">
        <h2>Horaires jour par jour</h2>
        <p className="section-lead">
          Il n'y a pas d'horaire récurrent : chaque jour est <strong>fermé tant qu'il n'a pas été ouvert
          explicitement</strong>. Un jour peut avoir plusieurs créneaux (par exemple 10h–13h et 16h–19h pour une
          pause déjeuner) — une réservation ne pourra jamais chevaucher la coupure. Faites défiler le calendrier
          pour choisir une date, puis réglez ses horaires ci-dessous.
        </p>

        {error && <p className="loading-text">Erreur : {error}</p>}
        {!error && days === null && <p className="loading-text">Chargement…</p>}

        {!error && days && (
        <>
          <div className="day-picker-scroll admin-day-picker" role="listbox" aria-label="Choisir une date à modifier">
            {days.map((day) => {
              const status = !day.isSet ? 'unset' : day.isClosed ? 'closed' : 'open';
              const isSelected = day.date === selectedDate;
              return (
                <button
                  key={day.date}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`day-chip is-${status} ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => setSelectedDate(day.date)}
                >
                  <span className="day-chip-dow">{DAY_NAMES[day.dayOfWeek]}</span>
                  <span className="day-chip-num">{formatShortDate(day.date)}</span>
                  <span className="day-chip-status">
                    {status === 'open' ? 'Ouvert' : status === 'closed' ? 'Fermé' : 'Non défini'}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedDay && <DayEditor key={selectedDay.date} day={selectedDay} onSave={saveDay} onReset={resetDay} />}
        </>
      )}
      </div>

      <CollapsibleCard
        title="Trajet et frais de déplacement (repli)"
        hint="Ne sert que si la distance réelle ne peut pas être calculée — à ouvrir seulement si besoin d'ajuster."
      >
        <TravelBufferCard />
      </CollapsibleCard>
    </>
  );
}
