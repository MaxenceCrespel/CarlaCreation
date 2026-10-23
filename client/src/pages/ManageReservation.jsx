import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useSeo } from '../hooks/useSeo';
import { formatPrice } from '../utils/format';

const PAYMENT_STATUS_LABELS = {
  pending: 'En attente de règlement',
  authorized: 'Réservé sur votre carte, débité à la confirmation du rendez-vous',
  paid: 'Réglé',
  refunded: 'Remboursé',
  partially_refunded: 'Partiellement remboursé',
  canceled: 'Annulé',
};

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
  const [reservation, setReservation] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  // Shows the reason field instead of the "Annuler" button — a click
  // straight through to cancellation with no way to say why left the admin
  // guessing every time a slot freed up.
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReasonSelect, setCancelReasonSelect] = useState('');
  const [cancelReasonDetails, setCancelReasonDetails] = useState('');

  useSeo({ title: 'Mon rendez-vous', path: `/mon-rendez-vous/${groupId}` });

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
    if (!window.confirm('Confirmez-vous l\'annulation de ce rendez-vous ?')) return;
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
          <div className="card">
            {paiementParam === 'reussi' && (
              <p className="form-feedback success" style={{ marginBottom: 16 }}>
                Paiement reçu, merci ! Votre demande est bien enregistrée.
              </p>
            )}
            {paiementParam === 'annule' && (
              <p className="form-feedback error" style={{ marginBottom: 16 }}>
                Le paiement n'a pas été finalisé — votre demande reste enregistrée, mais le règlement en ligne n'a pas
                encore été effectué. Contactez-nous si vous souhaitez réessayer.
              </p>
            )}
            <p>
              <strong>Statut :</strong>{' '}
              <span className={`status-badge status-${reservation.status}`}>
                {STATUS_LABELS[reservation.status] || reservation.status}
              </span>
            </p>
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
            {reservation.payment && (
              <p>
                <strong>Paiement en ligne ({formatPrice(reservation.payment.amountCents)}) :</strong>{' '}
                {PAYMENT_STATUS_LABELS[reservation.payment.status] || reservation.payment.status}
              </p>
            )}
            {reservation.paidOnSite != null && (
              <p>
                <strong>Paiement :</strong> {reservation.paidOnSite ? 'réglé sur place' : 'à régler sur place'}
              </p>
            )}
            <p><strong>Date :</strong> {formatDateFr(reservation.date)}</p>
            <p>
              <strong>Lieu :</strong>{' '}
              {reservation.atClientHome ? `À votre domicile${reservation.clientAddress ? ` — ${reservation.clientAddress}` : ''}` : 'Sur place'}
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '16px 0' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-alt)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px' }}>Personne</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px' }}>Prestation</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px' }}>Horaire</th>
                </tr>
              </thead>
              <tbody>
                {reservation.guests.map((g, i) => (
                  <tr key={i}>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-bg-alt)' }}>{g.name}</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-bg-alt)' }}>{g.serviceName}</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-bg-alt)' }}>{g.startTime} – {g.endTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>

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
            {reservation.status === 'cancelled' && (
              <>
                <p className="form-feedback success" role="status">Votre annulation est enregistrée, le créneau est libéré.</p>
                <Link to="/booking" className="btn btn-primary">Reprendre rendez-vous</Link>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
