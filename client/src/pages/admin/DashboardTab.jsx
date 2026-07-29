import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { formatPrice } from '../../utils/format';

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

function toMonthKey(y, m) {
  return `${y}-${String(m).padStart(2, '0')}`;
}
function currentMonth() {
  const now = new Date();
  return toMonthKey(now.getFullYear(), now.getMonth() + 1);
}
function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return toMonthKey(d.getFullYear(), d.getMonth() + 1);
}
function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  const label = MONTH_LABEL_FORMATTER.format(new Date(y, m - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// 'YYYY-MM' -> [firstDay, lastDay] as 'YYYY-MM-DD', in local time.
function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;
  return [from, to];
}

function formatHours(hours) {
  return `${hours.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`;
}

// null = no comparable previous value (avoids a misleading "+∞ %").
function pctChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// For metrics that are already a rate/percentage (e.g. taux de remplissage),
// a relative "% change of a %" reads as confusing — a plain point
// difference ("+5,2 pts") is clearer.
function pointChange(current, previous) {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  return Math.round((current - previous) * 10) / 10;
}

function DeltaBadge({ value, unit = '%' }) {
  if (value === null || value === undefined) return null;
  const sign = value > 0 ? '+' : '';
  const tone = value > 0 ? 'up' : value < 0 ? 'down' : 'neutral';
  return <span className={`kpi-delta kpi-delta-${tone}`}>{sign}{value.toLocaleString('fr-FR')} {unit} vs mois préc.</span>;
}

function KpiCard({ label, value, hint, delta, deltaUnit, bar }) {
  return (
    <div className="kpi-card">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      <DeltaBadge value={delta} unit={deltaUnit} />
      {bar}
      {hint && <span className="kpi-hint">{hint}</span>}
    </div>
  );
}

function ProgressBar({ percent, tone }) {
  return (
    <div className="progress-bar-track">
      <div className={`progress-bar-fill${tone ? ` progress-bar-${tone}` : ''}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  );
}

// Day-by-day revenue bars for the selected month — closed days show as a
// flat, faint bar so gaps in the schedule are visible at a glance.
function DailyRevenueChart({ days }) {
  const max = Math.max(1, ...days.map((d) => d.revenueCents));
  return (
    <div className="daily-chart">
      {days.map((d) => {
        const dayNum = Number(d.date.slice(-2));
        const heightPercent = d.revenueCents > 0 ? Math.max(4, Math.round((d.revenueCents / max) * 100)) : 0;
        return (
          <div
            key={d.date}
            className={`daily-chart-col${d.isClosed ? ' is-closed' : ''}`}
            title={`${dayNum} — ${formatPrice(d.revenueCents)}${d.isClosed ? ' (fermé)' : ''}`}
          >
            <div className="daily-chart-bar-track">
              <div className="daily-chart-bar" style={{ height: `${heightPercent}%` }} />
            </div>
            <span className="daily-chart-label">{dayNum}</span>
          </div>
        );
      })}
    </div>
  );
}

// Horizontal bars instead of a plain table — length shows revenue share at
// a glance, exact numbers stay alongside.
function TopServicesBars({ services }) {
  const max = Math.max(1, ...services.map((s) => s.revenueCents));
  return (
    <div className="top-services-bars">
      {services.map((s) => (
        <div key={s.serviceId} className="top-service-row">
          <span className="top-service-name">{s.name}</span>
          <div className="top-service-bar-track">
            <div className="top-service-bar" style={{ width: `${Math.max(4, Math.round((s.revenueCents / max) * 100))}%` }} />
          </div>
          <span className="top-service-value">{formatPrice(s.revenueCents)} · {s.count} rdv</span>
        </div>
      ))}
    </div>
  );
}

// Running total of the daily revenue across the month, with a dashed
// reference line at the projected-100%-fill figure — shows at a glance
// whether the month is tracking toward that projection.
function CumulativeRevenueChart({ days, targetCents }) {
  const width = 600;
  const height = 180;
  const padding = 10;

  let running = 0;
  const cumulative = days.map((d) => {
    running += d.revenueCents;
    return running;
  });
  const maxValue = Math.max(1, cumulative[cumulative.length - 1] ?? 0, targetCents);
  const stepX = days.length > 1 ? (width - padding * 2) / (days.length - 1) : 0;
  const toX = (i) => padding + i * stepX;
  const toY = (v) => height - padding - (v / maxValue) * (height - padding * 2);

  const linePoints = cumulative.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const targetY = toY(targetCents);
  const finalTotal = cumulative[cumulative.length - 1] ?? 0;

  return (
    <div className="cumulative-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="cumulative-chart-svg">
        {targetCents > 0 && <line x1={padding} y1={targetY} x2={width - padding} y2={targetY} className="cumulative-chart-target" />}
        <polyline points={linePoints} className="cumulative-chart-line" fill="none" />
      </svg>
      <div className="cumulative-chart-legend">
        <span>Cumul au {days[days.length - 1]?.date.slice(-2)} : <strong>{formatPrice(finalTotal)}</strong></span>
        {targetCents > 0 && <span className="cumulative-chart-legend-target">Objectif à 100 % de remplissage : {formatPrice(targetCents)}</span>}
      </div>
    </div>
  );
}

// Généré / à venir / en attente as a donut — the three buckets always sum
// to the total revenue shown across the KPI cards above.
function RevenueDonut({ generatedCents, upcomingCents, pendingCents }) {
  const total = generatedCents + upcomingCents + pendingCents;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const segments = [
    { key: 'generated', label: 'Généré', value: generatedCents, className: 'donut-generated' },
    { key: 'upcoming', label: 'À venir', value: upcomingCents, className: 'donut-upcoming' },
    { key: 'pending', label: 'En attente', value: pendingCents, className: 'donut-pending' },
  ];

  if (total === 0) {
    return <p className="loading-text">Aucun chiffre d'affaires sur cette période.</p>;
  }

  let offset = 0;
  return (
    <div className="revenue-donut">
      <svg viewBox="0 0 130 130" className="revenue-donut-svg">
        <g transform="translate(65,65) rotate(-90)">
          <circle r={radius} className="revenue-donut-track" fill="none" />
          {segments
            .filter((s) => s.value > 0)
            .map((s) => {
              const dash = (s.value / total) * circumference;
              const el = (
                <circle key={s.key} r={radius} fill="none" className={s.className} strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset} />
              );
              offset += dash;
              return el;
            })}
        </g>
      </svg>
      <ul className="revenue-donut-legend">
        {segments.map((s) => (
          <li key={s.key}>
            <span className={`revenue-donut-swatch ${s.className}`} />
            {s.label} — {formatPrice(s.value)} ({Math.round((s.value / total) * 100)} %)
          </li>
        ))}
      </ul>
    </div>
  );
}

function LocationSplitBar({ atHomeCount, studioCount }) {
  const total = atHomeCount + studioCount;
  const atHomePercent = total > 0 ? (atHomeCount / total) * 100 : 0;
  return (
    <div className="split-bar" title={`${atHomeCount} à domicile · ${studioCount} en studio`}>
      <div className="split-bar-segment split-bar-home" style={{ width: `${atHomePercent}%` }} />
      <div className="split-bar-segment split-bar-studio" style={{ width: `${100 - atHomePercent}%` }} />
    </div>
  );
}

export default function DashboardTab() {
  const showToast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [prevData, setPrevData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setPrevData(null);
    setError(null);
    const [from, to] = monthRange(month);
    const [prevFrom, prevTo] = monthRange(shiftMonth(month, -1));
    Promise.all([
      apiFetch(`/admin/dashboard?from=${from}&to=${to}`),
      apiFetch(`/admin/dashboard?from=${prevFrom}&to=${prevTo}`),
    ])
      .then(([current, previous]) => {
        setData(current);
        setPrevData(previous);
      })
      .catch((err) => {
        setError(err.message);
        showToast(err.message, 'error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const isCurrentMonth = month === currentMonth();
  // Comparing raw totals (CA généré, heures réservées) to a full previous
  // month is misleading for any month still in progress — they only grow
  // with days elapsed, so they'd read as "down" almost all month long.
  // Rate/average metrics don't have that problem: they're comparable no
  // matter how much of the month has passed.
  const avgBasketDelta = data && prevData ? pctChange(data.revenue.avgBasketCents, prevData.revenue.avgBasketCents) : null;
  const avgPerHourDelta = data && prevData ? pctChange(data.revenue.avgPerHourCents, prevData.revenue.avgPerHourCents) : null;
  const fillRateDelta = data && prevData ? pointChange(data.hours.fillRatePercent, prevData.hours.fillRatePercent) : null;
  const atHomeTotal = data ? data.location.atHomeCount + data.location.studioCount : 0;
  const atHomePercent = atHomeTotal > 0 ? Math.round((data.location.atHomeCount / atHomeTotal) * 1000) / 10 : 0;

  return (
    <>
      <div className="calendar-nav">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Mois précédent">
          &larr;
        </button>
        <div className="calendar-nav-center">
          <h3>{monthLabel(month)}</h3>
          {!isCurrentMonth && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setMonth(currentMonth())}>
              Mois en cours
            </button>
          )}
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Mois suivant">
          &rarr;
        </button>
      </div>

      {error && <p className="loading-text">Erreur : {error}</p>}
      {!error && !data && <p className="loading-text">Chargement…</p>}

      {!error && data && (
        <>
          <div className="kpi-grid">
            <KpiCard label="CA généré" value={formatPrice(data.revenue.generatedCents)} hint="Rendez-vous confirmés/terminés déjà passés" />
            <KpiCard label="CA à venir" value={formatPrice(data.revenue.upcomingCents)} hint="Rendez-vous confirmés à venir" />
            <KpiCard label="CA en attente" value={formatPrice(data.revenue.pendingCents)} hint="Non confirmé, non comptabilisé ci-dessus" />
            <KpiCard
              label="Panier moyen"
              value={formatPrice(data.revenue.avgBasketCents)}
              hint="CA généré + à venir / nombre de réservations confirmées"
              delta={avgBasketDelta}
            />
            <KpiCard
              label="CA moyen par heure"
              value={formatPrice(data.revenue.avgPerHourCents)}
              hint="Généré + à venir, sur les heures réellement réservées"
              delta={avgPerHourDelta}
            />
            <KpiCard
              label="CA projeté à taux de remplissage 100 %"
              value={formatPrice(data.revenue.projectedFullCapacityCents)}
              hint="Si toutes les heures ouvertes étaient réservées, au même tarif moyen"
            />
            <KpiCard label="Heures de rendez-vous" value={formatHours(data.hours.bookedHours)} hint="Confirmés/terminés" />
            <KpiCard label="Heures disponibles non prises" value={formatHours(data.hours.availableHours)} hint={`Sur ${formatHours(data.hours.openHours)} ouvertes`} />
            <KpiCard
              label="Taux de remplissage"
              value={`${data.hours.fillRatePercent.toLocaleString('fr-FR')} %`}
              bar={<ProgressBar percent={data.hours.fillRatePercent} />}
              delta={fillRateDelta}
              deltaUnit="pts"
            />
            <KpiCard
              label="Réservations"
              value={data.reservationsCount.total}
              hint={`${data.reservationsCount.confirmed} confirmées · ${data.reservationsCount.completed} terminées · ${data.reservationsCount.pending} en attente`}
            />
            <KpiCard
              label="Taux d'annulation / refus"
              value={`${data.reservationsCount.cancellationRatePercent.toLocaleString('fr-FR')} %`}
              hint="Sur l'ensemble des demandes de la période"
              bar={<ProgressBar percent={data.reservationsCount.cancellationRatePercent} tone="danger" />}
            />
            <KpiCard
              label="À domicile vs studio"
              value={atHomeTotal > 0 ? `${atHomePercent.toLocaleString('fr-FR')} % à domicile` : '—'}
              hint={`${data.location.atHomeCount} à domicile · ${data.location.studioCount} en studio`}
              bar={atHomeTotal > 0 ? <LocationSplitBar atHomeCount={data.location.atHomeCount} studioCount={data.location.studioCount} /> : null}
            />
            <KpiCard label="Nouvelles demandes" value={data.newReservationsCount} hint="Créées pendant la période" />
          </div>

          <div className="card" style={{ marginTop: 24 }}>
            <h2>Chiffre d'affaires cumulé</h2>
            <CumulativeRevenueChart days={data.dailyBreakdown} targetCents={data.revenue.projectedFullCapacityCents} />
          </div>

          <div className="card" style={{ marginTop: 24 }}>
            <h2>Chiffre d'affaires par jour</h2>
            <DailyRevenueChart days={data.dailyBreakdown} />
          </div>

          <div className="card" style={{ marginTop: 24 }}>
            <h2>Répartition du chiffre d'affaires</h2>
            <RevenueDonut
              generatedCents={data.revenue.generatedCents}
              upcomingCents={data.revenue.upcomingCents}
              pendingCents={data.revenue.pendingCents}
            />
          </div>

          <div className="card" style={{ marginTop: 24 }}>
            <h2>Prestations les plus demandées</h2>
            {data.topServices.length === 0 ? (
              <p className="loading-text">Aucune réservation confirmée sur cette période.</p>
            ) : (
              <TopServicesBars services={data.topServices} />
            )}
          </div>
        </>
      )}
    </>
  );
}
