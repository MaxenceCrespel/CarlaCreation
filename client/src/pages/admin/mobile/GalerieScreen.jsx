import { useEffect, useRef, useState } from 'react';
import { apiFetch, apiUpload } from '../../../api/client';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import { photoSrc } from '../../../utils/image';
import { Chips, Empty, ErrorText, Fab, Loading, Segmented, Sheet, TopBar } from './ui';
import { orderedCategoryTree, topLevelOf } from './helpers';

function CategorySelect({ id, categories, value, onChange }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Aucune</option>
      {orderedCategoryTree(categories).map((c) => (
        <option key={c.id} value={c.id}>{c.depth ? `— ${c.name}` : c.name}</option>
      ))}
    </select>
  );
}

function PhotoThumb({ item, width = 480 }) {
  return item.before_url ? (
    <span className="m-photo-pair">
      <img src={photoSrc(item.before_url, width)} alt={`Avant — ${item.alt_text}`} loading="lazy" />
      <img src={photoSrc(item.url, width)} alt={`Après — ${item.alt_text}`} loading="lazy" />
    </span>
  ) : (
    <img className="m-photo" src={photoSrc(item.url, width)} alt={item.alt_text} loading="lazy" />
  );
}

function EditPhotoSheet({ item, categories, onClose, onSaved, onDeleted }) {
  const confirm = useConfirm();
  const showToast = useToast();
  const [alt, setAlt] = useState(item.alt_text);
  const [categoryId, setCategoryId] = useState(item.category_id ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/admin/gallery/${item.id}`, { method: 'PATCH', body: { altText: alt, categoryId: categoryId === '' ? null : Number(categoryId) } });
      showToast('Photo mise à jour.', 'success');
      onSaved({ ...item, alt_text: alt, category_id: categoryId === '' ? null : Number(categoryId) });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await confirm('Supprimer définitivement cette photo ?'))) return;
    try {
      await apiFetch(`/admin/gallery/${item.id}`, { method: 'DELETE' });
      showToast('Photo supprimée.', 'success');
      onDeleted(item.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <Sheet title="Photo" onClose={onClose} left={{ label: 'Annuler', onClick: onClose }} right={{ label: saving ? '…' : 'Enregistrer', onClick: save, disabled: saving }} tall>
      <div className="m-photo-preview"><PhotoThumb item={item} width={800} /></div>
      <div className="m-field">
        <label htmlFor="m-photo-alt">Légende</label>
        <input id="m-photo-alt" type="text" maxLength={150} value={alt} onChange={(e) => setAlt(e.target.value)} />
      </div>
      <div className="m-field">
        <label htmlFor="m-photo-cat">Catégorie</label>
        <CategorySelect id="m-photo-cat" categories={categories} value={categoryId} onChange={setCategoryId} />
      </div>
      <button type="button" className="m-link m-link-danger" onClick={remove}>Supprimer la photo</button>
    </Sheet>
  );
}

function AddPhotoSheet({ categories, onClose, onCreated }) {
  const showToast = useToast();
  const [mode, setMode] = useState('pair');
  const [alt, setAlt] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [names, setNames] = useState({ before: '', after: '' });
  const [uploading, setUploading] = useState(false);
  const beforeRef = useRef(null);
  const afterRef = useRef(null);

  async function upload() {
    const before = beforeRef.current?.files?.[0];
    const after = afterRef.current?.files?.[0];
    if (!after || (mode === 'pair' && !before)) return showToast(mode === 'pair' ? 'Choisissez les photos « avant » et « après ».' : 'Choisissez une photo.', 'error');
    if (!alt.trim()) return showToast('Ajoutez une légende.', 'error');
    const data = new FormData();
    if (mode === 'pair') data.append('photoBefore', before);
    data.append('photoAfter', after);
    data.append('altText', alt.trim());
    if (categoryId) data.append('categoryId', categoryId);
    setUploading(true);
    try {
      const created = await apiUpload('/admin/gallery', data);
      showToast('Photo ajoutée.', 'success');
      onCreated(created);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  const picker = (ref, key, label) => (
    <label className="m-drop">
      <strong>{names[key] ? '✓ ' : ''}{label}</strong>
      <span className="m-muted m-small m-ellipsis">{names[key] || 'Appareil photo ou galerie'}</span>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="m-visually-hidden"
        onChange={(e) => setNames((n) => ({ ...n, [key]: e.target.files?.[0]?.name || '' }))}
      />
    </label>
  );

  return (
    <Sheet title="Nouvelle photo" onClose={onClose} left={{ label: 'Annuler', onClick: onClose }} right={{ label: uploading ? 'Envoi…' : 'Publier', onClick: upload, disabled: uploading }} tall>
      <Segmented
        label="Type de photo"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'pair', label: 'Avant / après' },
          { value: 'single', label: 'Photo simple' },
        ]}
      />
      <div className="m-drops">
        {mode === 'pair' && picker(beforeRef, 'before', 'Photo « avant »')}
        {picker(afterRef, 'after', mode === 'pair' ? 'Photo « après »' : 'Choisir la photo')}
      </div>
      <p className="m-hint">JPEG, PNG ou WebP · 5 Mo maximum par photo.</p>
      <div className="m-field">
        <label htmlFor="m-new-photo-alt">Légende</label>
        <input id="m-new-photo-alt" type="text" maxLength={150} placeholder="Ex : Balayage caramel" value={alt} onChange={(e) => setAlt(e.target.value)} />
      </div>
      <div className="m-field">
        <label htmlFor="m-new-photo-cat">Catégorie (optionnel)</label>
        <CategorySelect id="m-new-photo-cat" categories={categories} value={categoryId} onChange={setCategoryId} />
      </div>
    </Sheet>
  );
}

// Galerie : grille de photos filtrée par univers, mode « Réorganiser » avec
// des flèches, ajout depuis l'appareil photo ou la galerie du téléphone.
export default function GalerieScreen({ onBack }) {
  const showToast = useToast();
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [ordering, setOrdering] = useState(false);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    apiFetch('/admin/gallery').then(setItems).catch((err) => setError(err.message));
    apiFetch('/admin/service-categories').then(setCategories).catch(() => {});
  }, []);

  const sorted = [...(items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const roots = orderedCategoryTree(categories).filter((c) => c.depth === 0);
  const shown = filter === 'all' ? sorted : sorted.filter((i) => topLevelOf(categories, i.category_id) === filter);

  async function move(item, direction) {
    const index = sorted.findIndex((i) => i.id === item.id);
    const other = sorted[index + direction];
    if (!other) return;
    try {
      await Promise.all([
        apiFetch(`/admin/gallery/${item.id}`, { method: 'PATCH', body: { sortOrder: other.sort_order } }),
        apiFetch(`/admin/gallery/${other.id}`, { method: 'PATCH', body: { sortOrder: item.sort_order } }),
      ]);
      setItems((rows) =>
        rows.map((r) => (r.id === item.id ? { ...r, sort_order: other.sort_order } : r.id === other.id ? { ...r, sort_order: item.sort_order } : r)),
      );
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <div className="m-screen">
      <TopBar
        title="Galerie"
        back={{ label: 'Plus', onClick: onBack }}
        action={sorted.length > 1 ? { label: ordering ? 'Terminé' : 'Réorganiser', onClick: () => setOrdering((o) => !o) } : null}
      >
        <Chips
          label="Filtrer les photos"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Toutes', count: sorted.length },
            ...roots.map((c) => ({ value: c.id, label: c.name, count: sorted.filter((i) => topLevelOf(categories, i.category_id) === c.id).length })),
          ]}
        />
      </TopBar>
      {ordering && <p className="m-hint">Les flèches changent l'ordre d'affichage sur le site.</p>}
      {error && <ErrorText>{error}</ErrorText>}
      {!error && !items && <Loading />}
      {items && shown.length === 0 && <Empty>Aucune photo ici pour le moment.</Empty>}
      <div className="m-grid">
        {shown.map((item) => {
          const index = sorted.findIndex((i) => i.id === item.id);
          return (
            <div key={item.id} className="m-tile">
              <button type="button" className="m-tile-btn" onClick={() => !ordering && setEditing(item)} aria-label={`Modifier « ${item.alt_text} »`}>
                <PhotoThumb item={item} />
                <span className="m-tile-caption m-ellipsis">{item.alt_text}</span>
              </button>
              {ordering && (
                <div className="m-row-actions">
                  <button type="button" className="m-btn m-btn-sm" disabled={index === 0} aria-label={`Avancer « ${item.alt_text} »`} onClick={() => move(item, -1)}>←</button>
                  <button type="button" className="m-btn m-btn-sm" disabled={index === sorted.length - 1} aria-label={`Reculer « ${item.alt_text} »`} onClick={() => move(item, 1)}>→</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Fab label="Ajouter une photo" onClick={() => setAdding(true)} />

      {editing && (
        <EditPhotoSheet
          item={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setItems((rows) => rows.map((r) => (r.id === saved.id ? saved : r)));
            setEditing(null);
          }}
          onDeleted={(id) => {
            setItems((rows) => rows.filter((r) => r.id !== id));
            setEditing(null);
          }}
        />
      )}
      {adding && (
        <AddPhotoSheet
          categories={categories}
          onClose={() => setAdding(false)}
          onCreated={(created) => {
            setItems((rows) => [...(rows ?? []), created]);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}
