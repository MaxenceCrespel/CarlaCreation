import { formatPrice } from '../../../utils/format';
import { mapsUrl, reservationTotalCents, STATUS_LABELS, wazeUrl } from '../reservationUtils';
import { Badge, Empty, ErrorText, Icon, Loading } from './ui';
import { addDays, capitalize, formatDayLong, plural, relativeDay, STATUS_TONE, telHref, todayStr } from './helpers';

// Accueil du téléphone : ce qui se passe aujourd'hui, et tout ce qui attend
// une action (demandes à valider, messages, avis, stock, factures).
export default function TodayScreen({ rdv, counts, go, openAgendaDay }) {
  const today = todayStr();
  const tomorrow = addDays(today, 1);
  const list = rdv.list ?? [];

  const pending = list
    .filter((r) => r.status === 'pending' && r.reservation_date >= today)
    .sort((a, b) => (a.reservation_date + a.start_time).localeCompare(b.reservation_date + b.start_time));
  const todays = list
    .filter((r) => r.reservation_date === today && ['pending', 'confirmed', 'completed'].includes(r.status))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const tomorrowCount = list.filter((r) => r.reservation_date === tomorrow && ['pending', 'confirmed'].includes(r.status)).length;

  const todo = [
    counts.messages > 0 && { key: 'messages', label: `${plural(counts.messages, 'message non lu', 'messages non lus')}`, route: 'plus/messages' },
    counts.reviews > 0 && { key: 'avis', label: `${plural(counts.reviews, 'avis à modérer', 'avis à modérer')}`, route: 'plus/avis' },
    counts.lowStock > 0 && { key: 'stock', label: `${plural(counts.lowStock, 'produit à commander', 'produits à commander')}`, route: 'plus/stock' },
    counts.unpaidInvoices > 0 && {
      key: 'factures',
      label: `${plural(counts.unpaidInvoices, 'facture impayée', 'factures impayées')} · ${formatPrice(counts.unpaidCents)}`,
      route: 'plus/facturation',
    },
  ].filter(Boolean);

  return (
    <div className="m-screen">
      <header className="m-hello">
        <p className="m-eyebrow">{capitalize(formatDayLong(today))}</p>
        <h1 className="m-title">Bonjour</h1>
        {rdv.list && (
          <p className="m-subtitle">
            {todays.length === 0 ? 'Aucun rendez-vous aujourd’hui' : `${plural(todays.length, 'rendez-vous', 'rendez-vous')} aujourd’hui`}
            {pending.length > 0 ? ` · ${plural(pending.length, 'demande', 'demandes')} à valider` : ''}
          </p>
        )}
      </header>

      {rdv.error && <ErrorText>{rdv.error}</ErrorText>}
      {!rdv.error && !rdv.list && <Loading />}

      {rdv.list && pending.length > 0 && (
        <section className="m-section m-pending" aria-labelledby="m-pending-title">
          <h2 id="m-pending-title" className="m-section-title">{plural(pending.length, 'demande', 'demandes')} à valider</h2>
          {pending.map((r) => (
            <div key={r.id} className="m-pending-card">
              <button type="button" className="m-plain" onClick={() => rdv.open(r.id)}>
                <strong>{r.client_name}</strong>
                <span className="m-muted">{relativeDay(r.reservation_date)} · {r.start_time} · {r.service_name}{r.at_client_home ? ' · domicile' : ''}</span>
              </button>
              <div className="m-row-actions">
                <button type="button" className="m-btn m-btn-ok" onClick={() => rdv.accept(r.id)}>Accepter</button>
                <button type="button" className="m-btn m-btn-danger" onClick={() => rdv.refuse(r.id)}>Refuser</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {rdv.list && (
        <section className="m-section" aria-labelledby="m-today-title">
          <div className="m-section-head">
            <h2 id="m-today-title" className="m-section-title">Planning du jour</h2>
            <button type="button" className="m-link m-link-sm" onClick={() => openAgendaDay(today)}>Agenda ›</button>
          </div>
          {todays.length === 0 ? (
            <Empty>Pas de rendez-vous aujourd’hui.</Empty>
          ) : (
            <div className="m-card m-list">
              {todays.map((r) => (
                <div key={r.id} className="m-list-item m-today-item">
                  <button type="button" className="m-plain m-today-main" onClick={() => rdv.open(r.id)}>
                    <span className={`m-bar m-bar-${r.status}`} aria-hidden="true" />
                    <span className="m-time">
                      <strong>{r.start_time}</strong>
                      <span className="m-muted">{r.end_time}</span>
                    </span>
                    <span className="m-grow">
                      <strong className="m-ellipsis">{r.client_name}</strong>
                      <span className="m-muted m-ellipsis">{r.service_name} · {formatPrice(reservationTotalCents(r))}</span>
                      <span className="m-badges">
                        <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                        <Badge>{r.at_client_home ? 'Domicile' : 'Studio'}</Badge>
                      </span>
                    </span>
                  </button>
                  {r.at_client_home && r.client_address && (
                    <div className="m-quick">
                      <a className="m-quick-btn" href={wazeUrl(r.client_address)} target="_blank" rel="noopener noreferrer"><Icon name="navigate" size={18} />Waze</a>
                      <a className="m-quick-btn" href={mapsUrl(r.client_address)} target="_blank" rel="noopener noreferrer"><Icon name="pin" size={18} />Maps</a>
                      {r.client_phone && <a className="m-quick-btn" href={telHref(r.client_phone)}><Icon name="phone" size={18} />Appeler</a>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {tomorrowCount > 0 && (
            <button type="button" className="m-link m-link-sm" onClick={() => openAgendaDay(tomorrow)}>
              Demain : {plural(tomorrowCount, 'rendez-vous', 'rendez-vous')} ›
            </button>
          )}
        </section>
      )}

      <section className="m-section" aria-labelledby="m-todo-title">
        <h2 id="m-todo-title" className="m-section-title">À traiter</h2>
        {todo.length === 0 ? (
          <Empty>Rien d’autre à traiter pour le moment.</Empty>
        ) : (
          <div className="m-card m-list">
            {todo.map((t) => (
              <button key={t.key} type="button" className="m-list-item m-menu-item" onClick={() => go(t.route)}>
                <span className="m-dot" aria-hidden="true" />
                <span className="m-grow">{t.label}</span>
                <Icon name="next" size={18} />
              </button>
            ))}
          </div>
        )}
        <button type="button" className="m-link m-link-sm" onClick={() => go('plus/chiffres')}>Voir les chiffres du mois ›</button>
      </section>
    </div>
  );
}
