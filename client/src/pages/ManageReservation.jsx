import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useSeo } from '../hooks/useSeo';

const STATUS_LABELS = {
  pending: 'En attente de confirmation',
  confirmed: 'Confirmé',
  completed: 'Terminé',
  cancelled: 'Annulé',
  refused: 'Refusé',
};

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
  const showToast = useToast();
  const [reservation, setReservation] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  useSeo({ title: 'Mon rendez-vous', path: `/mon-rendez-vous/${groupId}` });

  function load() {
    setError(null);
    apiFetch(`/reservations/lookup/${groupId}`)
      .then(setReservation)
      .catch((err) => setError(err.message));
  }

  useEffect(load, [groupId]);

  async function handleCancel() {
    if (!window.confirm('Confirmez-vous l\'annulation de ce rendez-vous ?')) return;
    setCancelling(true);
    try {
      await apiFetch(`/reservations/lookup/${groupId}/cancel`, { method: 'POST' });
      showToast('Rendez-vous annulé.', 'success');
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
            <Link to="/booking" className="btn btn-primary">Prendre un nouveau rendez-vous</Link>
          </div>
        )}

        {!error && !reservation && <p className="loading-text center">Chargement…</p>}

        {!error && reservation && (
          <div className="card">
            <p>
              <strong>Statut :</strong>{' '}
              <span className={`status-badge status-${reservation.status}`}>
                {STATUS_LABELS[reservation.status] || reservation.status}
              </span>
            </p>
            <p><strong>Date :</strong> {formatDateFr(reservation.date)}</p>

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

            {(reservation.status === 'pending' || reservation.status === 'confirmed') && (
              <button type="button" className="btn btn-outline-danger" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? 'Annulation…' : 'Annuler mon rendez-vous'}
              </button>
            )}
            {reservation.status === 'cancelled' && <p className="loading-text">Ce rendez-vous a été annulé.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
