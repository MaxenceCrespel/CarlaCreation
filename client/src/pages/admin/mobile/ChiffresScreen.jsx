import { useEffect, useState } from 'react';
import { apiFetch } from '../../../api/client';
import { formatPrice } from '../../../utils/format';
import { Chips, ErrorText, Loading, Segmented, Sheet, TopBar } from './ui';
import { formatDayLong, monthLabel, MONTH_NAMES, shiftMonth, todayStr } from './helpers';

// Explications affichées quand on touche un chiffre (le « i ») — même
// définition que les calculs du tableau de bord côté serveur.
const EXPLAIN = {
  generated: ["Chiffre d'affaires généré", "L'argent des rendez-vous du mois qui ont déjà eu lieu : ce que vous avez réellement gagné à ce jour.", 'Rendez-vous confirmés ou terminés dont la date est passée.'],
  upcoming: ['CA à venir', "Ce que vont rapporter les rendez-vous déjà confirmés d'ici la fin du mois.", 'Rendez-vous confirmés dont la date est à venir.'],
  pending: ['CA en attente', "Les demandes pas encore acceptées. Elles ne sont comptées nulle part ailleurs tant qu'elles ne sont pas confirmées.", 'Rendez-vous au statut « en attente ».'],
  net: ['Marge nette', "Ce qu'il reste une fois les dépenses du mois retirées.", 'CA généré − dépenses de la période.'],
  expenses: ['Dépenses', 'Le total des dépenses enregistrées pour ce mois (produits, loyer, matériel…).', ''],
  reservations: ['Réservations', 'Le nombre de rendez-vous du mois.', ''],
  basket: ['Panier moyen', 'Ce que rapporte un rendez-vous en moyenne.', 'CA généré + à venir ÷ nombre de réservations confirmées.'],
  newRequests: ['Nouvelles demandes', 'Les demandes de rendez-vous reçues pendant le mois, quelle que soit la date du rendez-vous.', ''],
  cancellation: ["Taux d'annulation / refus", 'La part des demandes du mois annulées par la cliente ou refusées.', "Sur l'ensemble des demandes de la période."],
  fill: ['Taux de remplissage', "La part de vos heures d'ouverture occupées par des rendez-vous.", 'Heures de rendez-vous ÷ heures ouvertes (réglées dans Disponibilités).'],
  perHour: ['CA moyen par heure', 'Ce que vous gagnez en moyenne pour une heure de travail réservée.', 'CA généré + à venir ÷ heures réellement réservées.'],
  projected: ["Si l'agenda était plein", "Ce que vous gagneriez si toutes vos heures d'ouverture étaient réservées, au même tarif moyen.", 'CA moyen par heure × heures ouvertes.'],
  uniques: ['Visiteurs uniques', "Le nombre de personnes différentes venues sur le site. Une même personne qui revient plusieurs fois n'est comptée qu'une fois.", ''],
  pv: ['Pages vues', 'Le nombre total de pages consultées. Une personne qui regarde 3 pages compte pour 3 pages vues.', ''],
  ppv: ['Pages par visite', 'Le nombre moyen de pages consultées avant de repartir. Plus il est élevé, plus les visiteurs explorent le site.', ''],
  bounce: ['Taux de rebond', "La part des visites où la personne repart après une seule page. Un taux élevé peut vouloir dire que la page d'arrivée ne répond pas à ce qu'elle cherchait.", ''],
  traffic: ['Fréquentation', 'Les visites jour par jour (ou semaine par semaine sur 3 mois). Touchez une barre pour le détail.', ''],
  pages: ['Pages les plus vues', 'Les pages les plus consultées sur la période.', ''],
  sources: ["D'où viennent les visites", 'Recherche Google, adresse tapée directement, réseaux sociaux ou lien depuis un autre site.', ''],
  devices: ['Appareils', 'Le type d’appareil utilisé : la plupart des visiteurs viennent sur téléphone.', ''],
};

function currentMonth() {
  return todayStr().slice(0, 7);
}

function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  return [`${ym}-01`, `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`];
}

function pct(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function Delta({ value, unit = '%', inverse = false, suffix = '' }) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const tone = value === 0 ? 'flat' : (value > 0) !== inverse ? 'up' : 'down';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return <span className={`m-delta is-${tone}`}>{sign}{Math.abs(value).toLocaleString('fr-FR')} {unit}{suffix}</span>;
}

function InfoTitle({ children, onInfo, as: Tag = 'span', className = '' }) {
  return (
    <button type="button" className={`m-info-title ${className}`} onClick={onInfo}>
      <Tag className="m-info-label">{children}</Tag>
      <span className="m-info-i" aria-hidden="true">i</span>
    </button>
  );
}

function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="m-bars">
      {rows.map((r) => (
        <div key={r.name} className="m-bar-row">
          <div className="m-line"><span>{r.name}</span><span className="m-muted">{r.label}</span></div>
          <div className="m-bar-track"><div className={`m-bar-fill ${r.tone ? `is-${r.tone}` : ''}`} style={{ width: `${Math.max(3, Math.round((r.value / max) * 100))}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function CumulativeChart({ days, prevDays, cutoff }) {
  const W = 340;
  const H = 150;
  const PAD = 8;
  const cumulate = (list) => {
    let running = 0;
    return list.map((d) => (running += d.revenueCents));
  };
  const current = cumulate(days);
  const previous = cumulate(prevDays);
  const max = Math.max(1, current[current.length - 1] ?? 0, previous[previous.length - 1] ?? 0) * 1.05;
  const x = (i, len) => PAD + (i / Math.max(1, len - 1)) * (W - PAD * 2);
  const y = (v) => H - PAD - (v / max) * (H - PAD * 2);
  const line = (values, len, from = 0) => values.map((v, i) => `${i ? 'L' : 'M'}${x(i + from, len).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const past = cutoff == null ? current : current.slice(0, cutoff);
  const future = cutoff == null ? [] : current.slice(Math.max(0, cutoff - 1));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="m-cumul" role="img" aria-label="Chiffre d'affaires cumulé du mois comparé au mois précédent">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="m-cumul-axis" />
      {previous.length > 0 && <path d={line(previous, previous.length)} className="m-cumul-prev" />}
      {past.length > 0 && <path d={`${line(past, days.length)} L${x(past.length - 1, days.length).toFixed(1)} ${H - PAD} L${PAD} ${H - PAD} Z`} className="m-cumul-area" />}
      {past.length > 0 && <path d={line(past, days.length)} className="m-cumul-line" />}
      {future.length > 1 && <path d={line(future, days.length, Math.max(0, cutoff - 1))} className="m-cumul-future" />}
    </svg>
  );
}

function Activity({ onInfo }) {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [prev, setPrev] = useState(null);
  const [error, setError] = useState(null);
  const [chart, setChart] = useState('daily');
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    setData(null);
    setPrev(null);
    setError(null);
    setPicked(null);
    const [from, to] = monthRange(month);
    const [pFrom, pTo] = monthRange(shiftMonth(month, -1));
    Promise.all([apiFetch(`/admin/dashboard?from=${from}&to=${to}`), apiFetch(`/admin/dashboard?from=${pFrom}&to=${pTo}`)])
      .then(([cur, previous]) => {
        setData(cur);
        setPrev(previous);
      })
      .catch((err) => setError(err.message));
  }, [month]);

  const isCurrent = month === currentMonth();
  const isFuture = month > currentMonth();
  const prevName = MONTH_NAMES[Number(shiftMonth(month, -1).slice(5)) - 1];

  const nav = (
    <div className="m-month-nav">
      <button type="button" className="m-round-btn" aria-label="Mois précédent" onClick={() => setMonth((m) => shiftMonth(m, -1))}>‹</button>
      <span className="m-center">
        <strong className="m-block">{monthLabel(month)}</strong>
        {isCurrent ? (
          <span className="m-muted m-small">Mois en cours · au {Number(todayStr().slice(8))}</span>
        ) : (
          <button type="button" className="m-link m-link-sm" onClick={() => setMonth(currentMonth())}>Revenir au mois en cours</button>
        )}
      </span>
      <button type="button" className="m-round-btn" aria-label="Mois suivant" onClick={() => setMonth((m) => shiftMonth(m, 1))}>›</button>
    </div>
  );

  if (error) return <>{nav}<ErrorText>{error}</ErrorText></>;
  if (!data || !prev) return <>{nav}<Loading /></>;

  const { revenue, hours, reservationsCount, expenses, location } = data;
  const today = todayStr();
  const elapsed = isCurrent ? Number(today.slice(8)) : data.dailyBreakdown.length;
  // A month still in progress is compared to the previous month at the
  // same day, not to its full total (which would always look "down").
  const prevSameDay = prev.dailyBreakdown.slice(0, elapsed).reduce((s, d) => s + d.revenueCents, 0);
  const generatedDelta = isFuture ? null : pct(revenue.generatedCents, isCurrent ? prevSameDay : prev.revenue.generatedCents);
  const total = revenue.generatedCents + revenue.upcomingCents + revenue.pendingCents;
  const share = (v) => (total ? (v / total) * 100 : 0);
  const maxDay = Math.max(1, ...data.dailyBreakdown.map((d) => d.revenueCents));
  const pickedDay = picked ?? data.dailyBreakdown.reduce((best, d) => (d.revenueCents > (best?.revenueCents ?? -1) ? d : best), null);
  const homeTotal = location.atHomeCount + location.studioCount;
  const homePct = homeTotal ? Math.round((location.atHomeCount / homeTotal) * 100) : 0;

  const tiles = [
    { key: 'net', label: 'Marge nette', value: formatPrice(data.netCents), tone: data.netCents >= 0 ? 'ok' : 'ko' },
    { key: 'expenses', label: 'Dépenses', value: formatPrice(expenses.totalCents), delta: isCurrent ? null : pct(expenses.totalCents, prev.expenses.totalCents), inverse: true },
    { key: 'reservations', label: 'Réservations', value: reservationsCount.total, sub: `${reservationsCount.confirmed} confirmées · ${reservationsCount.completed} terminées · ${reservationsCount.pending} en attente` },
    { key: 'basket', label: 'Panier moyen', value: formatPrice(revenue.avgBasketCents), delta: pct(revenue.avgBasketCents, prev.revenue.avgBasketCents) },
    { key: 'newRequests', label: 'Nouvelles demandes', value: data.newReservationsCount, delta: isCurrent ? null : data.newReservationsCount - prev.newReservationsCount, unit: '' },
    { key: 'cancellation', label: 'Annulations / refus', value: `${reservationsCount.cancellationRatePercent.toLocaleString('fr-FR')} %`, delta: Math.round((reservationsCount.cancellationRatePercent - prev.reservationsCount.cancellationRatePercent) * 10) / 10, unit: 'pt', inverse: true },
  ];

  return (
    <>
      {nav}
      <section className="m-card m-card-pad m-hero">
        <InfoTitle onInfo={() => onInfo('generated')}>Chiffre d'affaires généré</InfoTitle>
        <div className="m-hero-value">
          <strong>{formatPrice(revenue.generatedCents)}</strong>
          <Delta value={generatedDelta} suffix={` vs ${prevName}${isCurrent ? ' au même jour' : ''}`} />
        </div>
        <div className="m-split" role="img" aria-label={`Généré ${formatPrice(revenue.generatedCents)}, à venir ${formatPrice(revenue.upcomingCents)}, en attente ${formatPrice(revenue.pendingCents)}`}>
          <span className="is-generated" style={{ width: `${share(revenue.generatedCents)}%` }} />
          <span className="is-upcoming" style={{ width: `${share(revenue.upcomingCents)}%` }} />
          <span className="is-pending" style={{ width: `${share(revenue.pendingCents)}%` }} />
        </div>
        <div className="m-legend">
          <span className="m-line"><span><i className="is-generated" />Généré · rdv passés</span><strong>{formatPrice(revenue.generatedCents)}</strong></span>
          <button type="button" className="m-line m-plain" onClick={() => onInfo('upcoming')}><span><i className="is-upcoming" />À venir · confirmés</span><strong>{formatPrice(revenue.upcomingCents)}</strong></button>
          <button type="button" className="m-line m-plain" onClick={() => onInfo('pending')}><span><i className="is-pending" />En attente · à valider</span><strong>{formatPrice(revenue.pendingCents)}</strong></button>
        </div>
      </section>

      <section className="m-card m-card-pad">
        <div className="m-line">
          <strong>Évolution du CA</strong>
          <Segmented
            label="Type de graphique"
            value={chart}
            onChange={setChart}
            options={[
              { value: 'daily', label: 'Par jour' },
              { value: 'cumul', label: 'Cumulé' },
            ]}
          />
        </div>
        {chart === 'daily' ? (
          <>
            {pickedDay && (
              <p className="m-readout">
                <span className="m-muted">{formatDayLong(pickedDay.date)}{pickedDay.date > today ? ' · à venir' : ''}</span>
                <strong>{pickedDay.isClosed && !pickedDay.revenueCents ? 'Fermé' : formatPrice(pickedDay.revenueCents)}</strong>
              </p>
            )}
            <div className="m-columns">
              {data.dailyBreakdown.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  className={`m-col ${d.date > today ? 'is-future' : ''} ${pickedDay?.date === d.date ? 'is-on' : ''} ${d.isClosed && !d.revenueCents ? 'is-closed' : ''}`}
                  aria-label={`${formatDayLong(d.date)} : ${d.isClosed && !d.revenueCents ? 'fermé' : formatPrice(d.revenueCents)}`}
                  onClick={() => setPicked(d)}
                >
                  <i style={{ height: `${d.revenueCents ? Math.max(4, (d.revenueCents / maxDay) * 100) : 2}%` }} />
                </button>
              ))}
            </div>
            <div className="m-axis"><span>1</span><span>8</span><span>15</span><span>22</span><span>{data.dailyBreakdown.length}</span></div>
          </>
        ) : (
          <>
            <div className="m-cumul-legend">
              <span><strong>{formatPrice(revenue.generatedCents + revenue.upcomingCents)}</strong><span className="m-muted m-block">{monthLabel(month)} (avec l'à venir)</span></span>
              <span><strong className="m-muted">{formatPrice(isCurrent ? prevSameDay : prev.revenue.generatedCents)}</strong><span className="m-muted m-block">{prevName}{isCurrent ? ' au même jour' : ''}</span></span>
            </div>
            <CumulativeChart days={data.dailyBreakdown} prevDays={prev.dailyBreakdown} cutoff={isCurrent ? elapsed : null} />
            <p className="m-hint">Trait plein : ce mois-ci · pointillés : {prevName} · trait clair : à venir.</p>
          </>
        )}
      </section>

      <div className="m-tiles">
        {tiles.map((t) => (
          <button key={t.key} type="button" className="m-tile-kpi" onClick={() => onInfo(t.key)}>
            <span className="m-line"><span className="m-muted m-small">{t.label}</span><span className="m-info-i" aria-hidden="true">i</span></span>
            <strong className={t.tone ? `is-${t.tone}` : ''}>{t.value}</strong>
            {t.delta != null && <Delta value={t.delta} unit={t.unit ?? '%'} inverse={t.inverse} />}
            {t.sub && <span className="m-muted m-small">{t.sub}</span>}
          </button>
        ))}
      </div>

      <section className="m-card m-card-pad">
        <InfoTitle onInfo={() => onInfo('fill')}>Remplissage de l'agenda</InfoTitle>
        <div className="m-hero-value">
          <strong>{hours.fillRatePercent.toLocaleString('fr-FR')} %</strong>
          <Delta value={Math.round((hours.fillRatePercent - prev.hours.fillRatePercent) * 10) / 10} unit="pts" />
        </div>
        <div className="m-bar-track is-big"><div className="m-bar-fill" style={{ width: `${Math.min(100, hours.fillRatePercent)}%` }} /></div>
        <div className="m-line"><span>Heures de rendez-vous</span><strong>{hours.bookedHours.toLocaleString('fr-FR')} h</strong></div>
        <div className="m-line"><span>Heures ouvertes non prises</span><strong>{hours.availableHours.toLocaleString('fr-FR')} h</strong></div>
        <button type="button" className="m-line m-plain" onClick={() => onInfo('perHour')}><span>CA moyen par heure</span><strong>{formatPrice(revenue.avgPerHourCents)}</strong></button>
        <button type="button" className="m-line m-plain" onClick={() => onInfo('projected')}><span>Si l'agenda était plein</span><strong className="is-ok">{formatPrice(revenue.projectedFullCapacityCents)}</strong></button>
      </section>

      <section className="m-card m-card-pad">
        <strong className="m-block">Prestations qui rapportent le plus</strong>
        {data.topServices.length === 0 ? (
          <p className="m-muted">Aucune réservation confirmée sur cette période.</p>
        ) : (
          <Bars rows={data.topServices.map((s) => ({ name: s.name, value: s.revenueCents, label: `${formatPrice(s.revenueCents)} · ${s.count} rdv` }))} />
        )}
      </section>

      <section className="m-card m-card-pad">
        <strong className="m-block">Dépenses par catégorie</strong>
        {expenses.byCategory.length === 0 ? (
          <p className="m-muted">Aucune dépense enregistrée sur cette période.</p>
        ) : (
          <Bars rows={expenses.byCategory.map((c) => ({ name: c.category, value: c.amountCents, label: formatPrice(c.amountCents), tone: 'green' }))} />
        )}
      </section>

      {homeTotal > 0 && (
        <section className="m-card m-card-pad">
          <strong className="m-block">À domicile ou au studio</strong>
          <div className="m-split is-two" role="img" aria-label={`${homePct} % à domicile, ${100 - homePct} % au studio`}>
            <span className="is-generated" style={{ width: `${homePct}%` }} />
            <span className="is-studio" style={{ width: `${100 - homePct}%` }} />
          </div>
          <div className="m-line"><span>À domicile · <strong>{homePct} %</strong></span><span>Studio · <strong>{100 - homePct} %</strong></span></div>
          <span className="m-muted m-small">{location.atHomeCount} à domicile · {location.studioCount} au studio</span>
        </section>
      )}
    </>
  );
}

const PERIODS = [
  { value: 'w1', label: '7 jours' },
  { value: 'm1', label: '30 jours' },
  { value: 'm3', label: '3 mois' },
];

function relLabel(idx, len, unit) {
  const distance = len - idx;
  const week = unit === 'semaine';
  if (distance === 0) return week ? 'Cette semaine' : "Aujourd'hui";
  return week ? `Il y a ${distance} semaine${distance > 1 ? 's' : ''}` : `Il y a ${distance} jour${distance > 1 ? 's' : ''}`;
}

function Visitors({ onInfo }) {
  const [period, setPeriod] = useState('m1');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    setStats(null);
    setPicked(null);
    apiFetch(`/admin/visitors?period=${period}`).then(setStats).catch((err) => setError(err.message));
  }, [period]);

  const periodChips = <Chips label="Période" value={period} onChange={setPeriod} options={PERIODS} />;
  if (error) return <>{periodChips}<ErrorText>{error}</ErrorText></>;
  if (!stats) return <>{periodChips}<Loading /></>;

  const counts = stats.chart.counts;
  const unit = stats.chart.unit;
  const max = Math.max(1, ...counts);
  const active = picked ?? counts.length;
  const k = stats.kpis;
  const tiles = [
    { key: 'uniques', label: 'Visiteurs uniques', value: k.uniqueVisitors, delta: k.uniqueVisitorsDeltaPct },
    { key: 'pv', label: 'Pages vues', value: k.pageViews, delta: k.pageViewsDeltaPct },
    { key: 'ppv', label: 'Pages par visite', value: k.pagesPerVisit.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) },
    { key: 'bounce', label: 'Taux de rebond', value: k.bounceRatePercent === null ? '—' : `${k.bounceRatePercent.toLocaleString('fr-FR')} %`, delta: k.bounceRateDeltaPts, unit: 'pts', inverse: true },
  ];

  return (
    <>
      {periodChips}
      <div className="m-tiles">
        {tiles.map((t) => (
          <button key={t.key} type="button" className="m-tile-kpi" onClick={() => onInfo(t.key)}>
            <span className="m-line"><span className="m-muted m-small">{t.label}</span><span className="m-info-i" aria-hidden="true">i</span></span>
            <strong>{t.value}</strong>
            {t.delta != null && <Delta value={t.delta} unit={t.unit ?? '%'} inverse={t.inverse} />}
          </button>
        ))}
      </div>
      <section className="m-card m-card-pad">
        <InfoTitle onInfo={() => onInfo('traffic')}>Fréquentation</InfoTitle>
        {counts.length > 0 && (
          <p className="m-readout">
            <span className="m-muted">{relLabel(active, counts.length, unit)}</span>
            <strong>{counts[active - 1]} visite{counts[active - 1] > 1 ? 's' : ''}</strong>
          </p>
        )}
        <div className="m-columns">
          {counts.map((c, i) => (
            <button
              key={i}
              type="button"
              className={`m-col ${active === i + 1 ? 'is-on' : ''}`}
              aria-label={`${relLabel(i + 1, counts.length, unit)} : ${c} visites`}
              onClick={() => setPicked(i + 1)}
            >
              <i style={{ height: `${c ? Math.max(4, (c / max) * 100) : 2}%` }} />
            </button>
          ))}
        </div>
      </section>
      {[
        { key: 'pages', title: 'Pages les plus vues', rows: stats.topPages.map((p) => ({ name: p.label, value: p.count, label: `${p.count} vue${p.count > 1 ? 's' : ''}` })) },
        { key: 'sources', title: "D'où viennent les visites", rows: stats.sources.map((s) => ({ name: s.name, value: s.pct, label: `${s.pct.toLocaleString('fr-FR')} %` })) },
        { key: 'devices', title: 'Appareils', rows: stats.devices.map((d) => ({ name: d.name, value: d.pct, label: `${d.pct.toLocaleString('fr-FR')} %` })) },
      ].map((block) => (
        <section key={block.key} className="m-card m-card-pad">
          <InfoTitle onInfo={() => onInfo(block.key)}>{block.title}</InfoTitle>
          {block.rows.length === 0 ? <p className="m-muted">Aucune visite sur cette période.</p> : <Bars rows={block.rows} />}
        </section>
      ))}
    </>
  );
}

// Chiffres : l'activité du mois (CA, marge, remplissage…) et la
// fréquentation du site, avec une explication en clair derrière chaque « i ».
export default function ChiffresScreen({ onBack }) {
  const [tab, setTab] = useState('activity');
  const [explain, setExplain] = useState(null);

  return (
    <div className="m-screen">
      <TopBar title="Chiffres" back={{ label: 'Plus', onClick: onBack }}>
        <Segmented
          label="Type de chiffres"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'activity', label: 'Activité' },
            { value: 'visitors', label: 'Visiteurs du site' },
          ]}
        />
      </TopBar>
      <div className="m-stack">
        {tab === 'activity' ? <Activity onInfo={setExplain} /> : <Visitors onInfo={setExplain} />}
      </div>
      {explain && (
        <Sheet title={EXPLAIN[explain][0]} onClose={() => setExplain(null)}>
          <p className="m-explain">{EXPLAIN[explain][1]}</p>
          {EXPLAIN[explain][2] && (
            <div className="m-recap">
              <span className="m-eyebrow">Calcul</span>
              <span>{EXPLAIN[explain][2]}</span>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
