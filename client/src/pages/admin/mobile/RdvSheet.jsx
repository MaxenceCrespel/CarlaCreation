import { formatPrice } from '../../../utils/format';
import { mapsUrl, PAYMENT_STATUS_LABELS, reservationTotalCents, STATUS_LABELS, wazeUrl } from '../reservationUtils';
import { Badge, Icon, Sheet, Switch } from './ui';
import { capitalize, formatDayLong, relativeDay, smsHref, STATUS_TONE, telHref, todayStr } from './helpers';

const PAYMENT_TONE = { pending: 'wait', authorized: 'wait', paid: 'ok', refunded: 'info', partially_refunded: 'wait', canceled: 'ko' };

// Fiche d'un rendez-vous, ouverte depuis Aujourd'hui ou l'Agenda : gros
// boutons d'action (appeler, SMS, Waze, Maps), le détail, et les actions qui
// dépendent du statut.
export default function RdvSheet({ reservation: r, reservations, onClose, actions }) {
  const group = r.group_id ? (reservations ?? []).filter((x) => x.group_id === r.group_id && x.id !== r.id) : [];
  const addons = r.addons ?? [];
  const hasDiscount = r.discount_percent > 0 || r.discount_cents > 0;
  const dayLabel = r.reservation_date === todayStr() ? "Aujourd'hui" : capitalize(formatDayLong(r.reservation_date));

  return (
    <Sheet title="Rendez-vous" onClose={onClose}>
      <div className="m-rdv-head">
        <div className="m-badges">
          <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABELS[r.status]}</Badge>
          {group.length > 0 && <Badge tone="info">Groupe · {group.length + 1} personnes</Badge>}
        </div>
        <h3 className="m-rdv-name">{r.client_name}</h3>
        <p className="m-muted">{dayLabel} · {r.start_time} – {r.end_time}</p>
      </div>

      <div className="m-actions-row">
        {r.client_phone && (
          <a className="m-action" href={telHref(r.client_phone)}><Icon name="phone" />Appeler</a>
        )}
        {r.client_phone && (
          <a className="m-action" href={smsHref(r.client_phone)}><Icon name="sms" />SMS</a>
        )}
        {r.at_client_home && r.client_address ? (
          <>
            <a className="m-action" href={wazeUrl(r.client_address)} target="_blank" rel="noopener noreferrer"><Icon name="navigate" />Waze</a>
            <a className="m-action" href={mapsUrl(r.client_address)} target="_blank" rel="noopener noreferrer"><Icon name="pin" />Maps</a>
          </>
        ) : (
          r.client_email && <a className="m-action" href={`mailto:${r.client_email}`}><Icon name="mail" />Email</a>
        )}
      </div>

      {r.status === 'pending' && (
        <div className="m-row-actions m-row-actions-lg">
          <button type="button" className="m-btn m-btn-ok" onClick={() => actions.accept(r.id)}>Accepter</button>
          <button type="button" className="m-btn m-btn-danger" onClick={() => actions.refuse(r.id)}>Refuser</button>
        </div>
      )}
      {r.status === 'confirmed' && r.reservation_date <= todayStr() && (
        <button type="button" className="m-btn m-btn-primary m-btn-block" onClick={() => actions.complete(r.id)}>Marquer comme terminé</button>
      )}

      <dl className="m-card m-dl">
        <div>
          <dt>Prestation</dt>
          <dd>
            {r.service_name} · {formatPrice(r.price_cents)}
            {addons.map((a) => (
              <span key={a.name} className="m-muted m-block">+ {a.name} ({formatPrice(a.extra_price_cents)})</span>
            ))}
            {hasDiscount && (
              <span className="m-muted m-block">
                {r.discount_cents > 0 ? `−${formatPrice(r.discount_cents)}` : `−${r.discount_percent} %`} {r.promotion_label ? `(${r.promotion_label})` : '(code promo)'}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd><strong>{formatPrice(reservationTotalCents(r))}</strong>{r.travel_fee_cents ? <span className="m-muted"> + {formatPrice(r.travel_fee_cents)} de déplacement</span> : ''}</dd>
        </div>
        {group.length > 0 && (
          <div>
            <dt>Autres personnes</dt>
            <dd>
              {group.map((g) => (
                <span key={g.id} className="m-block">{g.client_name} · {g.service_name} · {g.start_time}</span>
              ))}
            </dd>
          </div>
        )}
        <div>
          <dt>Lieu</dt>
          <dd>
            {r.at_client_home ? (
              <>
                À domicile · {r.client_address}
                {r.travel_distance_km != null && (
                  <span className="m-muted m-block">≈ {r.travel_distance_km} km · {r.travel_duration_minutes} min de trajet</span>
                )}
              </>
            ) : (
              'Studio'
            )}
          </dd>
        </div>
        <div>
          <dt>Contact</dt>
          <dd>
            {r.client_phone && <a className="m-block" href={telHref(r.client_phone)}>{r.client_phone}</a>}
            {r.client_email && <a className="m-block m-ellipsis" href={`mailto:${r.client_email}`}>{r.client_email}</a>}
          </dd>
        </div>
        <div>
          <dt>Paiement</dt>
          <dd>
            {r.payment_status ? (
              <>
                <Badge tone={PAYMENT_TONE[r.payment_status]}>{PAYMENT_STATUS_LABELS[r.payment_status] || r.payment_status}</Badge>{' '}
                {formatPrice(r.payment_amount_cents)} en ligne
              </>
            ) : (
              <span className="m-switch-row">
                <span>{r.paid_on_site ? 'Réglé sur place' : 'À régler sur place'}</span>
                <Switch checked={Boolean(r.paid_on_site)} label="Réglé sur place" onChange={(paid) => actions.setPaidOnSite(r.group_id, paid)} />
              </span>
            )}
          </dd>
        </div>
        {r.notes && (
          <div>
            <dt>Note</dt>
            <dd>{r.notes}</dd>
          </div>
        )}
        {r.status === 'cancelled' && r.cancellation_reason && (
          <div>
            <dt>Motif d'annulation</dt>
            <dd>{r.cancellation_reason}</dd>
          </div>
        )}
        <div>
          <dt>Fiche cliente</dt>
          <dd>
            {r.client_id ? (
              <span className="m-inline-actions">
                <button type="button" className="m-link m-link-sm" onClick={() => actions.openClient(r.client_id)}>Ouvrir la fiche ›</button>
                <button type="button" className="m-link m-link-sm" onClick={() => actions.writeTo(r.client_id)}>Écrire ›</button>
                <button type="button" className="m-link m-link-sm m-link-muted" onClick={() => actions.unlinkClient(r.id)}>Délier</button>
              </span>
            ) : (
              <button type="button" className="m-link m-link-sm" onClick={() => actions.linkClient(r)}>+ Lier ou créer une fiche</button>
            )}
          </dd>
        </div>
      </dl>

      <div className="m-row-actions">
        <button type="button" className="m-btn" onClick={() => actions.edit(r)}>Modifier</button>
        <button type="button" className="m-btn" onClick={() => actions.invoice(r)}>Facturer</button>
      </div>

      <div className="m-field">
        <label htmlFor="m-rdv-status">Changer le statut</label>
        <select id="m-rdv-status" value={r.status} onChange={(e) => actions.setStatus(r.id, e.target.value)}>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="m-danger-zone">
        {r.status === 'confirmed' && (
          <button type="button" className="m-link m-link-danger" onClick={() => actions.cancel(r.id)}>Annuler le rendez-vous</button>
        )}
        {group.length > 0 && r.status === 'pending' && (
          <button type="button" className="m-link m-link-danger" onClick={() => actions.refuseGroup(r.group_id)}>Refuser tout le groupe</button>
        )}
        <button type="button" className="m-link m-link-danger" onClick={() => actions.remove(r)}>Supprimer ce rendez-vous</button>
        {group.length > 0 && (
          <button type="button" className="m-link m-link-danger" onClick={() => actions.remove(r, true)}>Supprimer tout le groupe</button>
        )}
      </div>
      <p className="m-hint">{relativeDay(r.reservation_date)} · réservation n° {r.id}</p>
    </Sheet>
  );
}
