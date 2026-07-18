import { useEffect, useRef, useState } from 'react';
import { apiFetch, apiUpload } from '../../api/client';
import { useToast } from '../../context/ToastContext';

export default function GalleryTab() {
  const showToast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [altText, setAltText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState(null);
  const beforeInputRef = useRef(null);
  const afterInputRef = useRef(null);

  function load() {
    setError(null);
    apiFetch('/admin/gallery')
      .then(setItems)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleUpload(e) {
    e.preventDefault();
    setUploadFeedback(null);
    const before = beforeInputRef.current?.files?.[0];
    const after = afterInputRef.current?.files?.[0];
    if (!before || !after || !altText.trim()) {
      e.target.reportValidity();
      return;
    }

    const formData = new FormData();
    formData.append('photoBefore', before);
    formData.append('photoAfter', after);
    formData.append('altText', altText.trim());

    setUploading(true);
    try {
      const created = await apiUpload('/admin/gallery', formData);
      setItems((rows) => [...(rows ?? []), created]);
      setAltText('');
      if (beforeInputRef.current) beforeInputRef.current.value = '';
      if (afterInputRef.current) afterInputRef.current.value = '';
      setUploadFeedback({ type: 'success', text: 'Photos ajoutées avec succès.' });
      showToast('Photos ajoutées.', 'success');
    } catch (err) {
      setUploadFeedback({ type: 'error', text: err.message });
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function saveAlt(id, value) {
    try {
      await apiFetch(`/admin/gallery/${id}`, { method: 'PATCH', body: { altText: value } });
      showToast('Légende mise à jour.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function remove(id) {
    if (!window.confirm('Supprimer définitivement cette photo ?')) return;
    try {
      await apiFetch(`/admin/gallery/${id}`, { method: 'DELETE' });
      setItems((rows) => rows.filter((i) => i.id !== id));
      showToast('Photo supprimée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function swapOrder(id, direction) {
    const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
    const index = sorted.findIndex((i) => i.id === id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;

    const a = sorted[index];
    const b = sorted[swapIndex];
    try {
      await Promise.all([
        apiFetch(`/admin/gallery/${a.id}`, { method: 'PATCH', body: { sortOrder: b.sort_order } }),
        apiFetch(`/admin/gallery/${b.id}`, { method: 'PATCH', body: { sortOrder: a.sort_order } }),
      ]);
      setItems((rows) =>
        rows.map((r) => {
          if (r.id === a.id) return { ...r, sort_order: b.sort_order };
          if (r.id === b.id) return { ...r, sort_order: a.sort_order };
          return r;
        }),
      );
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const sorted = [...(items ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <>
      <form className="card upload-form" noValidate onSubmit={handleUpload}>
        <h2>Ajouter une photo avant/après</h2>
        <div className="form-row">
          <label htmlFor="photo-before">Photo « avant » (JPEG, PNG ou WebP, 5 Mo max)</label>
          <input type="file" id="photo-before" ref={beforeInputRef} accept="image/jpeg,image/png,image/webp" required />
        </div>
        <div className="form-row">
          <label htmlFor="photo-after">Photo « après » (JPEG, PNG ou WebP, 5 Mo max)</label>
          <input type="file" id="photo-after" ref={afterInputRef} accept="image/jpeg,image/png,image/webp" required />
        </div>
        <div className="form-row">
          <label htmlFor="photo-alt">Légende</label>
          <input type="text" id="photo-alt" maxLength={150} required placeholder="Ex : Balayage caramel" value={altText} onChange={(e) => setAltText(e.target.value)} />
        </div>
        {uploadFeedback && (
          <div className={`form-feedback ${uploadFeedback.type}`} role="status" aria-live="polite">{uploadFeedback.text}</div>
        )}
        <button type="submit" className="btn btn-primary" disabled={uploading}>
          {uploading ? 'Envoi en cours…' : 'Téléverser les photos'}
        </button>
      </form>

      {error && <p className="loading-text">Erreur : {error}</p>}
      {!error && items === null && <p className="loading-text">Chargement…</p>}
      {!error && items !== null && sorted.length === 0 && (
        <p className="loading-text">Aucune photo pour le moment. Ajoutez-en une ci-dessus.</p>
      )}

      {!error && sorted.length > 0 && (
        <div className="admin-gallery-grid">
          {sorted.map((item, i) => (
            <GalleryCard
              key={item.id}
              item={item}
              isFirst={i === 0}
              isLast={i === sorted.length - 1}
              onSave={saveAlt}
              onDelete={remove}
              onMoveUp={() => swapOrder(item.id, -1)}
              onMoveDown={() => swapOrder(item.id, 1)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function GalleryCard({ item, isFirst, isLast, onSave, onDelete, onMoveUp, onMoveDown }) {
  const [alt, setAlt] = useState(item.alt_text);

  return (
    <div className="admin-gallery-card">
      {item.before_url ? (
        <div className="admin-gallery-card-pair">
          <img src={`/${item.before_url}`} alt={`Avant — ${item.alt_text}`} loading="lazy" />
          <img src={`/${item.url}`} alt={`Après — ${item.alt_text}`} loading="lazy" />
        </div>
      ) : (
        <img src={`/${item.url}`} alt={item.alt_text} loading="lazy" />
      )}
      <div className="admin-gallery-card-body">
        <input type="text" className="alt-input" value={alt} maxLength={150} aria-label="Légende" onChange={(e) => setAlt(e.target.value)} />
        <div className="admin-gallery-card-actions">
          <button type="button" disabled={isFirst} onClick={onMoveUp} aria-label="Monter">&uarr;</button>
          <button type="button" disabled={isLast} onClick={onMoveDown} aria-label="Descendre">&darr;</button>
          <button type="button" className="save-btn" onClick={() => onSave(item.id, alt)}>Enregistrer</button>
          <button type="button" className="danger" onClick={() => onDelete(item.id)}>Supprimer</button>
        </div>
      </div>
    </div>
  );
}
