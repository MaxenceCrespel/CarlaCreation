import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../context/ToastContext';

const STATUS_LABELS = { pending: 'En attente', approved: 'Approuvé', rejected: 'Refusé' };
const FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'pending', label: 'En attente' },
  { key: 'approved', label: 'Approuvés' },
  { key: 'rejected', label: 'Refusés' },
];

function Stars({ value }) {
  return (
    <span className="stars" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? 'star is-filled' : 'star'}>★</span>
      ))}
    </span>
  );
}

export default function AvisTab() {
  const showToast = useToast();
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('pending');

  function load() {
    setError(null);
    apiFetch('/admin/reviews')
      .then(setReviews)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function setStatus(id, status) {
    try {
      const updated = await apiFetch(`/admin/reviews/${id}/status`, { method: 'PATCH', body: { status } });
      setReviews((rows) => rows.map((r) => (r.id === id ? updated : r)));
      showToast(status === 'approved' ? 'Avis approuvé.' : 'Avis refusé.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function remove(id) {
    if (!window.confirm('Supprimer définitivement cet avis ?')) return;
    try {
      await apiFetch(`/admin/reviews/${id}`, { method: 'DELETE' });
      setReviews((rows) => rows.filter((r) => r.id !== id));
      showToast('Avis supprimé.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const filtered = (reviews ?? []).filter((r) => filter === 'all' || r.status === filter);
  const pendingCount = (reviews ?? []).filter((r) => r.status === 'pending').length;

  return (
    <div className="card">
      <h2>Avis clients</h2>
      <p className="section-lead">
        Les avis soumis par les client·e·s restent « en attente » et n'apparaissent pas sur le site tant qu'ils ne
        sont pas approuvés. La note moyenne affichée sur l'accueil ne prend en compte que les avis approuvés.
      </p>

      <div className="admin-filter-row" role="tablist" aria-label="Filtrer les avis">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            className={`admin-filter-btn ${filter === f.key ? 'is-active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}{f.key === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        ))}
      </div>

      {error && <p className="loading-text">Erreur : {error}</p>}
      {!error && reviews === null && <p className="loading-text">Chargement…</p>}
      {!error && reviews !== null && filtered.length === 0 && (
        <p className="loading-text">Aucun avis dans cette catégorie.</p>
      )}

      {!error && filtered.length > 0 && (
        <ul className="admin-review-list">
          {filtered.map((review) => (
            <li key={review.id} className={`admin-review-card status-${review.status}`}>
              <div className="admin-review-head">
                <Stars value={review.rating} />
                <span className={`status-badge status-${review.status}`}>{STATUS_LABELS[review.status]}</span>
              </div>
              <p className="admin-review-comment">« {review.comment} »</p>
              <p className="admin-review-meta">
                — {review.clientName} · {new Date(review.createdAt).toLocaleDateString('fr-FR')}
              </p>
              <div className="admin-review-actions">
                {review.status !== 'approved' && (
                  <button type="button" className="save-btn" onClick={() => setStatus(review.id, 'approved')}>Approuver</button>
                )}
                {review.status !== 'rejected' && (
                  <button type="button" onClick={() => setStatus(review.id, 'rejected')}>Refuser</button>
                )}
                <button type="button" className="danger" onClick={() => remove(review.id)}>Supprimer</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
