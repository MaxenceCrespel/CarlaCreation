import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { useSeo } from '../hooks/useSeo';
import { formatPrice } from '../utils/format';


const STATUS_ICONS = { pending: '⏳', confirmed: '✓', completed: '✓', cancelled: '✕', refused: '✕' };

// Headline + one sentence per status, shown in the coloured banner at the top.
const STATUS_HEADINGS = {
  pending: { title: 'Demande envoyée', text: 'Carla va confirmer votre rendez-vous très prochainement.' },
  confirmed: { title: 'Rendez-vous confirmé', text: 'Tout est bon, à très bientôt !' },
  completed: { title: 'Rendez-vous terminé', text: 'Merci pour votre visite.' },
  cancelled: { title: 'Rendez-vous annulé', text: 'Le créneau a été libéré.' },
  refused: {
    title: 'Demande refusée',
    text: "Carla n'a pas pu accepter ce créneau. Vous pouvez en choisir un autre ou la contacter.",
  },
};

// What the client needs to know about their online payment, given the state
// of both the payment and the appointment.
function describePayment(reservation) {
  const p = reservation.payment;
  if (!p) return null;
  const amount = formatPrice(p.amountCents);
  const ended = ['cancelled', 'refused'].includes(reservation.status);
  switch (p.status) {
    case 'pending':
      return { tone: 'warn', text: `Règlement de ${amount} en attente.` };
    case 'authorized':
      return {
        tone: 'ok',
        text: `${amount} réservés sur votre carte : ils ne seront débités qu'à la confirmation de votre rendez-vous.`,
      };
    case 'paid':
      return ended
        ? { tone: 'warn', text: `Votre remboursement de ${amount} est en cours de traitement : Carla vous recontacte si besoin.` }
        : { tone: 'ok', text: `Paiement de ${amount} réglé en ligne.` };
    case 'refunded':
      return {
        tone: 'ok',
        text: `${amount} remboursés sur votre carte. Comptez 5 à 10 jours ouvrés pour les voir sur votre relevé.`,
      };
    case 'partially_refunded':
      return { tone: 'ok', text: 'Votre paiement a été partiellement remboursé.' };
    case 'canceled':
      return { tone: 'ok', text: `Aucun débit : les ${amount} réservés sur votre carte ont été libérés.` };
    default:
      return null;
  }
}

const STATUS_LABELS = {
  pending: 'En attente de confirmation',
  confirmed: 'Confirmé',
  completed: 'Terminé',
  cancelled: 'Annulé',
  refused: 'Refusé',
};

// Covers the common cases at a glance — "Autre" plus the optional free-text
// field below still let a client explain anything more specific.
const CANCEL_REASONS = [
  'Empêchement personnel',
  'Problème de santé',
  'Contrainte professionnelle',
  'Erreur de réservation',
  'Je ne suis plus disponible ce jour-là',
  'Autre',
];

const DAY_NAMES_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTH_NAMES_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function formatDateFr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAY_NAMES_FR[date.getDay()]} ${d} ${MONTH_NAMES_FR[m - 1]} ${y}`;
}

export default function ManageReservation() {
  const { groupId } = useParams();
  const [searchParams] = useSearchParams();
  const paiementParam = searchParams.get('paiement');
  const showToast = useToast();
  const confirm = useConfirm();
  const [reservation, setReservation] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  // Shows the reason field instead of the "Annuler" button — a click
  // straight through to cancellation with no way to say why left the admin
  // guessing every time a slot freed up.
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReasonSelect, setCancelReasonSelect] = useState('');
  const [cancelReasonDetails, setCancelReasonDetails] = useState('');

  useSeo({ title: 'Mon rendez-vous', path: `/mon-rendez-vous/${groupId}`, noindex: true });
  const paymentNotice = reservation ? describePayment(reservation) : null;

  function load() {
    setError(null);
    apiFetch(`/reservations/lookup/${groupId}`)
      .then(setReservation)
      .catch((err) => setError(err.message));
  }

  useEffect(load, [groupId]);

  function closeCancelForm() {
    setShowCancelForm(false);
    setCancelReasonSelect('');
    setCancelReasonDetails('');
  }

  async function handleCancel(e) {
    e.preventDefault();
    if (!cancelReasonSelect) {
      showToast('Merci de choisir un motif.', 'error');
      return;
    }
    const details = cancelReasonDetails.trim();
    const reason = details ? `${cancelReasonSelect} — ${details}` : cancelReasonSelect;

    // Second check, in the site's own dialog, telling the client exactly what
    // cancelling will do to their payment before it happens.
    const amount = reservation.payment ? formatPrice(reservation.payment.amountCents) : '';
    const outcome = {
      refund: `Vous serez remboursé de ${amount} sur votre carte (comptez 5 à 10 jours ouvrés).`,
      release: `Aucun débit : les ${amount} réservés sur votre carte seront libérés.`,
    }[reservation.payment?.cancelOutcome];
    const confirmed = await confirm({
      title: 'Annuler définitivement ce rendez-vous ?',
      message: `${formatDateFr(reservation.date)} — ${outcome || 'le créneau sera libéré pour quelqu\'un d\'autre.'}`,
      confirmLabel: "Oui, j'annule",
      cancelLabel: 'Non, le garder',
    });
    if (!confirmed) return;
    setCancelling(true);
    try {
      await apiFetch(`/reservations/lookup/${groupId}/cancel`, { method: 'POST', body: { reason } });
      showToast('Rendez-vous annulé.', 'success');
      setShowCancelForm(false);
      setCancelReasonSelect('');
      setCancelReasonDetails('');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 640 }}>
        <p className="eyebrow center">Mon rendez-vous</p>
        <h1 className="center">Suivi de votre demande</h1>

        {error && (
          <div className="card" style={{ textAlign: 'center' }}>
            <p className="loading-text">
              {error === 'Réservation introuvable.'
                ? 'Ce lien de rendez-vous est invalide ou a expiré.'
                : `Erreur : ${error}`}
            </p>
            <div className="not-found-actions">
              <Link to="/booking" className="btn btn-primary">Prendre un nouveau rendez-vous</Link>
              <Link to="/contact" className="btn btn-outline">Contacter Carla</Link>
            </div>
          </div>
        )}

        {!error && !reservation && <p className="loading-text center">Chargement…</p>}

        {!error && reservation && (
          <div className="card manage-card">
            <div className={`manage-status is-${reservation.status}`}>
              <span className="manage-status-icon" aria-hidden="true">
                {STATUS_ICONS[reservation.status] || '•'}
              </span>
              <div>
                <h2>{STATUS_HEADINGS[reservation.status]?.title || STATUS_LABELS[reservation.status]}</h2>
                <p>{STATUS_HEADINGS[reservation.status]?.text}</p>
                <span className={`status-badge status-${reservation.status}`}>
                  {STATUS_LABELS[reservation.status] || reservation.status}
                </span>
              </div>
            </div>

            {['pending', 'confirmed', 'completed'].includes(reservation.status) && (
              <ol className="track-steps" aria-label="Avancement du rendez-vous">
                {[['pending', 'Réservé'], ['confirmed', 'Confirmé'], ['completed', 'Terminé']].map(([key, label], i) => {
                  const order = ['pending', 'confirmed', 'completed'];
                  return (
                    <li key={key} className={order.indexOf(reservation.status) >= i ? 'is-done' : ''}>
                      <span className="track-bar" />
                      <span className="track-label">{label}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            {paiementParam === 'annule' && ['pending', 'confirmed'].includes(reservation.status) && (
              <p className="manage-notice is-warn">
                Le paiement n'a pas été finalisé — votre demande reste enregistrée, mais le règlement en ligne n'a pas
                encore été effectué. Contactez-nous si vous souhaitez réessayer.
              </p>
            )}
            {paymentNotice && <p className={`manage-notice is-${paymentNotice.tone}`}>{paymentNotice.text}</p>}

            <dl className="manage-summary">
              <div>
                <dt>Date</dt>
                <dd>{formatDateFr(reservation.date)}</dd>
              </div>
              <div>
                <dt>Lieu</dt>
                <dd>
                  {reservation.atClientHome
                    ? `À votre domicile${reservation.clientAddress ? ` — ${reservation.clientAddress}` : ''}`
                    : 'Au studio'}
                </dd>
              </div>
              {reservation.paidOnSite != null && (
                <div>
                  <dt>Règlement</dt>
                  <dd>{reservation.paidOnSite ? 'Réglé sur place' : 'À régler sur place'}</dd>
                </div>
              )}
            </dl>

            <ul className="manage-guests">
              {reservation.guests.map((g, i) => (
                <li key={i}>
                  <div>
                    <strong>{g.name}</strong>
                    <span>{g.serviceName}</span>
                  </div>
                  <span className="manage-guest-time">{g.startTime} – {g.endTime}</span>
                </li>
              ))}
            </ul>

            {(reservation.status === 'pending' || reservation.status === 'confirmed') && !showCancelForm && (
              <button type="button" className="btn btn-outline-danger" onClick={() => setShowCancelForm(true)}>
                Annuler mon rendez-vous
              </button>
            )}

            {(reservation.status === 'pending' || reservation.status === 'confirmed') && showCancelForm && (
              <div className="modal-overlay is-sheet" onClick={closeCancelForm}>
                <form
                  className="modal-card modal-sheet"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="cancel-title"
                  onClick={(e) => e.stopPropagation()}
                  onSubmit={handleCancel}
                >
                  <div className="sheet-handle" aria-hidden="true" />
                  <h2 id="cancel-title">Annuler le rendez-vous ?</h2>
                  <p>Le {formatDateFr(reservation.date)} · le créneau sera libéré pour quelqu'un d'autre.</p>
                  <fieldset className="cancel-reasons">
                    <legend>Motif</legend>
                    {CANCEL_REASONS.map((r) => (
                      <label key={r} className={`cancel-reason ${cancelReasonSelect === r ? 'is-selected' : ''}`}>
                        <input
                          type="radio"
                          name="cancel-reason"
                          value={r}
                          checked={cancelReasonSelect === r}
                          onChange={() => {
                            setCancelReasonSelect(r);
                          }}
                        />
                        {r}
                      </label>
                    ))}
                  </fieldset>
                  <div className="form-row">
                    <label htmlFor="cancel-reason-details">Précision (facultatif)</label>
                    <textarea
                      id="cancel-reason-details"
                      rows={3}
                      maxLength={500}
                      placeholder="Des détails à ajouter ?"
                      value={cancelReasonDetails}
                      onChange={(e) => setCancelReasonDetails(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn btn-danger btn-block" disabled={cancelling}>
                    {cancelling ? 'Annulation…' : "Confirmer l'annulation"}
                  </button>
                  <button type="button" className="btn btn-outline btn-block" onClick={closeCancelForm}>
                    Garder mon rendez-vous
                  </button>
                </form>
              </div>
            )}
            {reservation.status === 'refused' && (
              <div className="not-found-actions">
                <Link to="/booking" className="btn btn-primary">Choisir un autre créneau</Link>
                <Link to="/contact" className="btn btn-outline">Contacter Carla</Link>
              </div>
            )}
            {reservation.status === 'cancelled' && (
              <>
                <Link to="/booking" className="btn btn-primary">Reprendre rendez-vous</Link>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
