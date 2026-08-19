import { useEffect, useRef, useState } from 'react';
import { apiFetch, apiUpload } from '../../api/client';
import { useToast } from '../../context/ToastContext';

// Flattens the (max one level deep) category tree into a single ordered
// list — each top-level category immediately followed by its
// subcategories — so a <select> can show the hierarchy via indentation.
function orderedCategoryTree(categories) {
  const topLevel = categories.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const result = [];
  for (const top of topLevel) {
    result.push({ ...top, depth: 0 });
    categories
      .filter((c) => c.parent_id === top.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((child) => result.push({ ...child, depth: 1 }));
  }
  return result;
}

export default function GalleryTab() {
  const showToast = useToast();
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [altText, setAltText] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [uploadMode, setUploadMode] = useState('pair'); // 'pair' | 'single' — e.g. nail art rarely has a meaningful "before"
  const [uploading, setUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const beforeInputRef = useRef(null);
  const afterInputRef = useRef(null);

  function load() {
    setError(null);
    apiFetch('/admin/gallery')
      .then(setItems)
      .catch((err) => setError(err.message));
    apiFetch('/admin/service-categories').then(setCategories).catch(() => {});
  }

  useEffect(load, []);

  async function handleUpload(e) {
    e.preventDefault();
    setUploadFeedback(null);
    const before = beforeInputRef.current?.files?.[0];
    const after = afterInputRef.current?.files?.[0];
    if (!after || (uploadMode === 'pair' && !before) || !altText.trim()) {
      e.target.reportValidity();
      return;
    }

    const formData = new FormData();
    if (uploadMode === 'pair') formData.append('photoBefore', before);
    formData.append('photoAfter', after);
    formData.append('altText', altText.trim());
    if (categoryId) formData.append('categoryId', categoryId);

    setUploading(true);
    try {
      const created = await apiUpload('/admin/gallery', formData);
      setItems((rows) => [...(rows ?? []), created]);
      setAltText('');
      setCategoryId('');
      if (beforeInputRef.current) beforeInputRef.current.value = '';
      if (afterInputRef.current) afterInputRef.current.value = '';
      setUploadFeedback({ type: 'success', text: 'Photo ajoutée avec succès.' });
      setShowAddForm(false);
      showToast('Photo ajoutée.', 'success');
    } catch (err) {
      setUploadFeedback({ type: 'error', text: err.message });
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function saveCard(id, { altText: alt, categoryId: catId }) {
    try {
      await apiFetch(`/admin/gallery/${id}`, {
        method: 'PATCH',
        body: { altText: alt, categoryId: catId === '' ? null : Number(catId) },
      });
      setItems((rows) => rows.map((r) => (r.id === id ? { ...r, alt_text: alt, category_id: catId === '' ? null : Number(catId) } : r)));
      showToast('Photo mise à jour.', 'success');
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
      {!showAddForm && (
        <button type="button" className="btn btn-primary btn-sm" style={{ marginBottom: 24 }} onClick={() => setShowAddForm(true)}>
          + Ajouter une photo
        </button>
      )}

      {showAddForm && (
      <form className="card upload-form" noValidate onSubmit={handleUpload}>
        <h2>Ajouter une photo</h2>

        <div className="form-row">
          <label>Type de photo</label>
          <div className="view-toggle" role="radiogroup" aria-label="Type de photo">
            <button
              type="button"
              role="radio"
              aria-checked={uploadMode === 'pair'}
              className={`view-toggle-btn ${uploadMode === 'pair' ? 'is-active' : ''}`}
              onClick={() => setUploadMode('pair')}
            >
              Avant / Après
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={uploadMode === 'single'}
              className={`view-toggle-btn ${uploadMode === 'single' ? 'is-active' : ''}`}
              onClick={() => setUploadMode('single')}
            >
              Photo simple
            </button>
          </div>
          <p className="form-hint">
            « Photo simple » pour un résultat sans transformation à comparer (ex : nail art). « Avant / Après » pour
            une coupe, coloration, etc.
          </p>
        </div>

        {uploadMode === 'pair' && (
          <div className="form-row">
            <label htmlFor="photo-before">Photo « avant » (JPEG, PNG ou WebP, 5 Mo max)</label>
            <input type="file" id="photo-before" ref={beforeInputRef} accept="image/jpeg,image/png,image/webp" required />
          </div>
        )}
        <div className="form-row">
          <label htmlFor="photo-after">{uploadMode === 'pair' ? 'Photo « après »' : 'Photo'} (JPEG, PNG ou WebP, 5 Mo max)</label>
          <input type="file" id="photo-after" ref={afterInputRef} accept="image/jpeg,image/png,image/webp" required />
        </div>
        <div className="form-row">
          <label htmlFor="photo-alt">Légende</label>
          <input type="text" id="photo-alt" maxLength={150} required placeholder="Ex : Balayage caramel" value={altText} onChange={(e) => setAltText(e.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="photo-category">Catégorie (optionnel)</label>
          <select id="photo-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Aucune</option>
            {orderedCategoryTree(categories).map((c) => (
              <option key={c.id} value={c.id}>{c.depth > 0 ? `— ${c.name}` : c.name}</option>
            ))}
          </select>
        </div>
        {uploadFeedback && (
          <div className={`form-feedback ${uploadFeedback.type}`} role="status" aria-live="polite">{uploadFeedback.text}</div>
        )}
        <div className="manual-reservation-form-actions">
          <button type="submit" className="btn btn-primary" disabled={uploading}>
            {uploading ? 'Envoi en cours…' : uploadMode === 'pair' ? 'Téléverser les photos' : 'Téléverser la photo'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setShowAddForm(false)}>Annuler</button>
        </div>
      </form>
      )}

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
              categories={categories}
              isFirst={i === 0}
              isLast={i === sorted.length - 1}
              onSave={saveCard}
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

function GalleryCard({ item, categories, isFirst, isLast, onSave, onDelete, onMoveUp, onMoveDown }) {
  const [alt, setAlt] = useState(item.alt_text);
  const [categoryId, setCategoryId] = useState(item.category_id ?? '');

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
        <select aria-label="Catégorie" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Aucune catégorie</option>
          {orderedCategoryTree(categories).map((c) => (
            <option key={c.id} value={c.id}>{c.depth > 0 ? `— ${c.name}` : c.name}</option>
          ))}
        </select>
        <div className="admin-gallery-card-actions">
          <button type="button" disabled={isFirst} onClick={onMoveUp} aria-label="Monter">&uarr;</button>
          <button type="button" disabled={isLast} onClick={onMoveDown} aria-label="Descendre">&darr;</button>
          <button type="button" className="save-btn" onClick={() => onSave(item.id, { altText: alt, categoryId })}>Enregistrer</button>
          <button type="button" className="danger" onClick={() => onDelete(item.id)}>Supprimer</button>
        </div>
      </div>
    </div>
  );
}
