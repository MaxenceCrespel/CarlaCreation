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

function DeltaBadge({ value }) {
  if (value === null || value === undefined) return null;
  const sign = value > 0 ? '+' : '';
  const tone = value > 0 ? 'up' : value < 0 ? 'down' : 'neutral';
  return <span className={`kpi-delta kpi-delta-${tone}`}>{sign}{value.toLocaleString('fr-FR')} % vs mois préc.</span>;
}

function KpiCard({ label, value, hint, delta }) {
  return (
    <div className="kpi-card">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      <DeltaBadge value={delta} />
      {hint && <span className="kpi-hint">{hint}</span>}
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
  const revenueDelta = data && prevData ? pctChange(data.revenue.generatedCents, prevData.revenue.generatedCents) : null;
  const hoursDelta = data && prevData ? pctChange(data.hours.bookedHours, prevData.hours.bookedHours) : null;
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
            <KpiCard label="CA généré" value={formatPrice(data.revenue.generatedCents)} hint="Rendez-vous confirmés/terminés déjà passés" delta={revenueDelta} />
            <KpiCard label="CA à venir" value={formatPrice(data.revenue.upcomingCents)} hint="Rendez-vous confirmés à venir" />
            <KpiCard label="CA en attente" value={formatPrice(data.revenue.pendingCents)} hint="Non confirmé, non comptabilisé ci-dessus" />
            <KpiCard label="Panier moyen" value={formatPrice(data.revenue.avgBasketCents)} hint="CA généré + à venir / nombre de réservations confirmées" />
            <KpiCard label="CA moyen par heure" value={formatPrice(data.revenue.avgPerHourCents)} hint="Généré + à venir, sur les heures réellement réservées" />
            <KpiCard
              label="CA projeté à taux de remplissage 100 %"
              value={formatPrice(data.revenue.projectedFullCapacityCents)}
              hint="Si toutes les heures ouvertes étaient réservées, au même tarif moyen"
            />
            <KpiCard label="Heures de rendez-vous" value={formatHours(data.hours.bookedHours)} hint="Confirmés/terminés" delta={hoursDelta} />
            <KpiCard label="Heures disponibles non prises" value={formatHours(data.hours.availableHours)} hint={`Sur ${formatHours(data.hours.openHours)} ouvertes`} />
            <KpiCard label="Taux de remplissage" value={`${data.hours.fillRatePercent.toLocaleString('fr-FR')} %`} />
            <KpiCard
              label="Réservations"
              value={data.reservationsCount.total}
              hint={`${data.reservationsCount.confirmed} confirmées · ${data.reservationsCount.completed} terminées · ${data.reservationsCount.pending} en attente`}
            />
            <KpiCard label="Taux d'annulation / refus" value={`${data.reservationsCount.cancellationRatePercent.toLocaleString('fr-FR')} %`} hint="Sur l'ensemble des demandes de la période" />
            <KpiCard
              label="À domicile vs studio"
              value={atHomeTotal > 0 ? `${atHomePercent.toLocaleString('fr-FR')} % à domicile` : '—'}
              hint={`${data.location.atHomeCount} à domicile · ${data.location.studioCount} en studio`}
            />
            <KpiCard label="Nouvelles demandes" value={data.newReservationsCount} hint="Créées pendant la période" />
          </div>

          <div className="card" style={{ marginTop: 24 }}>
            <h2>Prestations les plus demandées</h2>
            {data.topServices.length === 0 ? (
              <p className="loading-text">Aucune réservation confirmée sur cette période.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Prestation</th>
                    <th>Réservations</th>
                    <th>Chiffre d'affaires</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topServices.map((s) => (
                    <tr key={s.serviceId}>
                      <td>{s.name}</td>
                      <td>{s.count}</td>
                      <td>{formatPrice(s.revenueCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}
