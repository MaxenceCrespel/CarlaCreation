import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../api/client';

const PERIODS = [
  { key: 'w1', label: '7 derniers jours' },
  { key: 'm1', label: '30 derniers jours' },
  { key: 'm3', label: '3 derniers mois' },
];

const EXPLANATIONS = {
  uniques: {
    title: 'Visiteurs uniques',
    text: "Le nombre de personnes différentes qui ont visité le site sur la période. Une même personne qui revient plusieurs fois n'est comptée qu'une seule fois.",
  },
  pv: {
    title: 'Pages vues',
    text: 'Le nombre total de pages consultées, toutes visites confondues. Une personne qui regarde 3 pages compte pour 3 pages vues.',
  },
  ppv: {
    title: 'Pages par visite',
    text: 'En moyenne, le nombre de pages qu’un·e visiteur·se consulte avant de repartir. Plus ce chiffre est élevé, plus les visiteurs explorent le site au lieu de repartir tout de suite.',
  },
  rebond: {
    title: 'Taux de rebond',
    text: "La part des visites où la personne repart juste après avoir vu une seule page, sans cliquer ailleurs. Un taux élevé peut vouloir dire que la page sur laquelle elle arrive ne répond pas à ce qu'elle cherchait.",
  },
  frequentation: {
    title: 'Fréquentation',
    text: 'Le nombre de visites jour par jour (ou semaine par semaine sur 3 mois). Appuyez sur une barre du graphique pour voir le détail exact de ce jour ou de cette semaine.',
  },
  pages: {
    title: 'Pages les plus vues',
    text: 'Les pages les plus consultées sur la période, classées de la plus à la moins visitée. Utile pour savoir ce qui intéresse le plus vos visiteurs.',
  },
  sources: {
    title: "D'où viennent les visites",
    text: 'Comment les visiteurs arrivent sur le site : recherche Google, adresse tapée directement (ou favori), lien sur les réseaux sociaux, ou lien depuis un autre site.',
  },
  appareils: {
    title: 'Appareils',
    text: 'Le type d’appareil utilisé pour consulter le site : téléphone, ordinateur ou tablette. Utile pour vérifier que le site reste agréable sur mobile, là où viennent la plupart des visiteurs.',
  },
};

function pluralize(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function relLabel(idx, len, unit, short) {
  const distance = len - idx; // idx is 1-based
  const isWeek = unit === 'semaine';
  if (distance === 0) return short ? (isWeek ? 'Actuelle' : 'Auj.') : isWeek ? 'Cette semaine' : "Aujourd'hui";
  const prefix = isWeek ? 'S-' : 'J-';
  const word = isWeek ? (distance === 1 ? 'semaine' : 'semaines') : distance === 1 ? 'jour' : 'jours';
  return short ? `${prefix}${distance}` : `Il y a ${distance} ${word}`;
}

function InfoButton({ explainKey, onOpen }) {
  return (
    <button type="button" className="card-info-btn" aria-label={`À propos de ${EXPLANATIONS[explainKey]?.title || 'cette carte'}`} onClick={() => onOpen(explainKey)}>
      i
    </button>
  );
}

function DeltaBadge({ value, unit, goodIfPositive }) {
  if (value === null || value === undefined) return null;
  const sign = value > 0 ? '+' : '';
  const tone = value === 0 ? 'neutral' : (value > 0) === goodIfPositive ? 'up' : 'down';
  return (
    <span className={`kpi-delta kpi-delta-${tone}`}>
      {sign}
      {value.toLocaleString('fr-FR')} {unit} vs période préc.
    </span>
  );
}

export default function VisitorsTab() {
  const [period, setPeriod] = useState('m1');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [explainKey, setExplainKey] = useState(null);
  const [selectedBar, setSelectedBar] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    setError(null);
    apiFetch(`/admin/visitors?period=${period}`)
      .then((data) => {
        setStats(data);
        setSelectedBar(null);
      })
      .catch((err) => setError(err.message));
  }, [period]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!explainKey) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') setExplainKey(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [explainKey]);

  const counts = stats?.chart.counts ?? [];
  const unit = stats?.chart.unit ?? 'jour';
  const len = counts.length;
  const max = Math.max(0, ...counts);
  const peakIdx = counts.indexOf(max); // 0-based, -1 if empty
  const activeIdx = selectedBar !== null ? selectedBar : peakIdx + 1; // 1-based
  const activeCount = activeIdx > 0 ? counts[activeIdx - 1] : 0;
  const isPeakActive = activeIdx === peakIdx + 1;
  const tickStep = len <= 7 ? 1 : unit === 'jour' ? 5 : 2;

  return (
    <div className="card">
      <div className="visitors-head">
        <h2>Visiteurs</h2>
        <div className="period-picker" ref={menuRef}>
          <button
            type="button"
            className="period-select"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {PERIODS.find((p) => p.key === period)?.label} ▾
          </button>
          {menuOpen && (
            <div className="period-menu" role="menu">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  role="menuitem"
                  className={p.key === period ? 'is-active' : ''}
                  onClick={() => {
                    setPeriod(p.key);
                    setMenuOpen(false);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <p className="loading-text">Erreur : {error}</p>}
      {!error && !stats && <p className="loading-text">Chargement…</p>}

      {!error && stats && (
        <>
          <p className="section-label">Vue d'ensemble</p>
          <div className="kpi-grid">
            <div className="kpi-card">
              <InfoButton explainKey="uniques" onOpen={setExplainKey} />
              <span className="kpi-label">Visiteurs uniques</span>
              <span className="kpi-value">{stats.kpis.uniqueVisitors}</span>
              <DeltaBadge value={stats.kpis.uniqueVisitorsDeltaPct} unit="%" goodIfPositive />
            </div>
            <div className="kpi-card">
              <InfoButton explainKey="pv" onOpen={setExplainKey} />
              <span className="kpi-label">Pages vues</span>
              <span className="kpi-value">{stats.kpis.pageViews}</span>
              <DeltaBadge value={stats.kpis.pageViewsDeltaPct} unit="%" goodIfPositive />
            </div>
            <div className="kpi-card">
              <InfoButton explainKey="ppv" onOpen={setExplainKey} />
              <span className="kpi-label">Pages / visite</span>
              <span className="kpi-value">{stats.kpis.pagesPerVisit.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
            </div>
            <div className="kpi-card">
              <InfoButton explainKey="rebond" onOpen={setExplainKey} />
              <span className="kpi-label">Taux de rebond</span>
              <span className="kpi-value">{stats.kpis.bounceRatePercent === null ? '—' : `${stats.kpis.bounceRatePercent.toLocaleString('fr-FR')} %`}</span>
              <DeltaBadge value={stats.kpis.bounceRateDeltaPts} unit="pts" goodIfPositive={false} />
            </div>
          </div>

          <p className="section-label">Fréquentation</p>
          <div className="card-wrap">
            <InfoButton explainKey="frequentation" onOpen={setExplainKey} />
            <div className="visitor-chart" role="group" aria-label={`Visites sur ${PERIODS.find((p) => p.key === period)?.label.toLowerCase()}`}>
              {counts.map((count, i) => {
                const idx = i + 1;
                const showLabel = idx === 1 || idx === len || (len - idx) % tickStep === 0;
                const pct = max > 0 ? Math.max(6, Math.round((count / max) * 100)) : 0;
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`visitor-chart-col${idx === activeIdx ? ' is-selected' : ''}`}
                    aria-label={`${relLabel(idx, len, unit)} — ${pluralize(count, 'visite')}`}
                    onClick={() => setSelectedBar(idx)}
                  >
                    <div className="visitor-chart-bar-track">
                      <div className="visitor-chart-bar" style={{ height: `${pct}%` }} />
                    </div>
                    <span className="visitor-chart-label">{showLabel ? relLabel(idx, len, unit, true) : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {activeIdx > 0 && (
            <div className="chart-readout">
              <span className="rd-day">{relLabel(activeIdx, len, unit)}</span>
              <span className="rd-count">
                {pluralize(activeCount, 'visite')}{isPeakActive && max > 0 ? ' — pic de la période' : ''}
              </span>
            </div>
          )}
          <p className="chart-caption">Appuyez sur une barre pour voir le détail</p>

          <p className="section-label">Pages les plus vues</p>
          <div className="card-wrap">
            <InfoButton explainKey="pages" onOpen={setExplainKey} />
            {stats.topPages.length === 0 ? (
              <p className="loading-text">Aucune visite sur cette période.</p>
            ) : (
              <div className="rank-list">
                {stats.topPages.map((p, i) => (
                  <div className="rank-row" key={p.path}>
                    <span className="rank-num">{i + 1}</span>
                    <span className="rank-name">{p.label}</span>
                    <span className="rank-count">{pluralize(p.count, 'vue')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="section-label">D'où viennent les visites</p>
          <div className="card-wrap">
            <InfoButton explainKey="sources" onOpen={setExplainKey} />
            {stats.sources.length === 0 ? (
              <p className="loading-text">Aucune visite sur cette période.</p>
            ) : (
              <div className="breakdown">
                {stats.sources.map((s) => (
                  <div className="breakdown-row" key={s.name}>
                    <div className="breakdown-top">
                      <span className="breakdown-name">{s.name}</span>
                      <span className="breakdown-pct">{s.pct.toLocaleString('fr-FR')} %</span>
                    </div>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${s.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="section-label">Appareils</p>
          <div className="card-wrap">
            <InfoButton explainKey="appareils" onOpen={setExplainKey} />
            {stats.devices.length === 0 ? (
              <p className="loading-text">Aucune visite sur cette période.</p>
            ) : (
              <div className="breakdown">
                {stats.devices.map((d) => (
                  <div className="breakdown-row" key={d.name}>
                    <div className="breakdown-top">
                      <span className="breakdown-name">{d.name}</span>
                      <span className="breakdown-pct">{d.pct.toLocaleString('fr-FR')} %</span>
                    </div>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${d.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {explainKey && (
        <div className="explain-overlay" onClick={(e) => e.target === e.currentTarget && setExplainKey(null)}>
          <div className="explain-card">
            <button type="button" className="explain-close" aria-label="Fermer" onClick={() => setExplainKey(null)}>
              ×
            </button>
            <h3>{EXPLANATIONS[explainKey].title}</h3>
            <p>{EXPLANATIONS[explainKey].text}</p>
          </div>
        </div>
      )}
    </div>
  );
}
