import { useEffect, useState } from 'react';
import { apiFetch } from '../../../api/client';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import { Badge, Chips, Empty, ErrorText, Loading, TopBar } from './ui';

const STATUS = {
  pending: { label: 'À modérer', tone: 'wait' },
  approved: { label: 'Publié', tone: 'ok' },
  rejected: { label: 'Masqué', tone: 'ko' },
};

function ReviewCard({ review, onStatus, onReply, onRemove }) {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState(review.adminReply ?? '');
  const [saving, setSaving] = useState(false);

  async function saveReply() {
    setSaving(true);
    const ok = await onReply(review.id, draft);
    setSaving(false);
    if (ok) setReplying(false);
  }

  return (
    <article className="m-card m-card-pad m-review">
      <div className="m-review-head">
        <span>
          <strong className="m-block">{review.clientName}</strong>
          <span className="m-muted m-small">{new Date(review.createdAt).toLocaleDateString('fr-FR')}</span>
        </span>
        <Badge tone={STATUS[review.status].tone}>{STATUS[review.status].label}</Badge>
      </div>
      <span className="m-stars" role="img" aria-label={`${review.rating} étoiles sur 5`}>
        {'★'.repeat(review.rating)}
        <span className="m-stars-off">{'★'.repeat(5 - review.rating)}</span>
      </span>
      <p className="m-review-text">« {review.comment} »</p>

      {review.adminReply && !replying && (
        <div className="m-reply">
          <span className="m-muted m-small">Votre réponse publique</span>
          <span className="m-block">{review.adminReply}</span>
        </div>
      )}

      {replying ? (
        <>
          <div className="m-field">
            <label htmlFor={`m-reply-${review.id}`}>Réponse visible publiquement sous l'avis</label>
            <textarea id={`m-reply-${review.id}`} rows={3} maxLength={1000} value={draft} onChange={(e) => setDraft(e.target.value)} />
          </div>
          <div className="m-row-actions">
            <button type="button" className="m-btn" onClick={() => { setReplying(false); setDraft(review.adminReply ?? ''); }}>Annuler</button>
            <button type="button" className="m-btn m-btn-primary" disabled={saving} onClick={saveReply}>
              {saving ? 'Envoi…' : draft.trim() === '' && review.adminReply ? 'Supprimer la réponse' : 'Publier'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="m-row-actions">
            {review.status !== 'approved' && <button type="button" className="m-btn m-btn-ok" onClick={() => onStatus(review.id, 'approved')}>Publier l'avis</button>}
            {review.status !== 'rejected' && <button type="button" className="m-btn" onClick={() => onStatus(review.id, 'rejected')}>Masquer</button>}
            <button type="button" className="m-btn" onClick={() => setReplying(true)}>{review.adminReply ? 'Modifier la réponse' : 'Répondre'}</button>
          </div>
          <button type="button" className="m-link m-link-sm m-link-danger" onClick={() => onRemove(review.id)}>Supprimer l'avis</button>
        </>
      )}
    </article>
  );
}

// Avis clients : à modérer avant publication, avec réponse publique.
export default function AvisScreen({ onBack, refreshCounts }) {
  const confirm = useConfirm();
  const showToast = useToast();
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('pending');

  useEffect(() => {
    apiFetch('/admin/reviews')
      .then((rows) => {
        setReviews(rows);
        if (!rows.some((r) => r.status === 'pending')) setFilter('all');
      })
      .catch((err) => setError(err.message));
  }, []);

  async function setStatus(id, status) {
    try {
      const updated = await apiFetch(`/admin/reviews/${id}/status`, { method: 'PATCH', body: { status } });
      setReviews((rows) => rows.map((r) => (r.id === id ? updated : r)));
      refreshCounts();
      showToast(status === 'approved' ? 'Avis publié.' : 'Avis masqué.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function reply(id, text) {
    try {
      const updated = await apiFetch(`/admin/reviews/${id}/reply`, { method: 'PATCH', body: { reply: text } });
      setReviews((rows) => rows.map((r) => (r.id === id ? updated : r)));
      showToast(text.trim() === '' ? 'Réponse supprimée.' : 'Réponse publiée.', 'success');
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    }
  }

  async function remove(id) {
    if (!(await confirm('Supprimer définitivement cet avis ?'))) return;
    try {
      await apiFetch(`/admin/reviews/${id}`, { method: 'DELETE' });
      setReviews((rows) => rows.filter((r) => r.id !== id));
      refreshCounts();
      showToast('Avis supprimé.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const all = reviews ?? [];
  const approved = all.filter((r) => r.status === 'approved');
  const average = approved.length ? approved.reduce((s, r) => s + r.rating, 0) / approved.length : null;
  const list = all.filter((r) => filter === 'all' || r.status === filter);

  return (
    <div className="m-screen">
      <TopBar
        title="Avis clients"
        back={{ label: 'Plus', onClick: onBack }}
        subtitle={average != null ? `Note moyenne publiée : ${average.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} / 5 · ${approved.length} avis` : 'Un avis n’apparaît sur le site qu’une fois publié.'}
      >
        <Chips
          label="Filtrer les avis"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'pending', label: 'À modérer', count: all.filter((r) => r.status === 'pending').length },
            { value: 'approved', label: 'Publiés', count: approved.length },
            { value: 'rejected', label: 'Masqués', count: all.filter((r) => r.status === 'rejected').length },
            { value: 'all', label: 'Tous', count: all.length },
          ]}
        />
      </TopBar>
      {error && <ErrorText>{error}</ErrorText>}
      {!error && !reviews && <Loading />}
      {reviews && list.length === 0 && <Empty>Aucun avis dans cette catégorie.</Empty>}
      <div className="m-stack">
        {list.map((r) => (
          <ReviewCard key={`${r.id}-${r.adminReply ?? ''}`} review={r} onStatus={setStatus} onReply={reply} onRemove={remove} />
        ))}
      </div>
    </div>
  );
}
