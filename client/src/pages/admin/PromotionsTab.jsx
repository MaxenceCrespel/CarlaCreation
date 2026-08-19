import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../context/ToastContext';

const EMPTY_FORM = { label: '', discountPercent: '10', requiresCode: false, code: '' };

function AddPromotionForm({ onCreated, onCancel }) {
  const showToast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.label.trim()) return;
    if (form.requiresCode && !form.code.trim()) {
      showToast('Un code est requis pour ce type de promotion.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const created = await apiFetch('/admin/promotions', {
        method: 'POST',
        body: {
          label: form.label.trim(),
          discountPercent: Number(form.discountPercent) || 1,
          requiresCode: form.requiresCode,
          code: form.requiresCode ? form.code.trim() : undefined,
        },
      });
      onCreated(created);
      setForm(EMPTY_FORM);
      showToast('Promotion créée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
      <h2>Ajouter une promotion</h2>
      <div className="form-row four-col">
        <div>
          <label htmlFor="promo-label">Libellé</label>
          <input type="text" id="promo-label" required maxLength={100} placeholder="Ex : Tarif étudiant" value={form.label} onChange={update('label')} />
        </div>
        <div>
          <label htmlFor="promo-percent">Réduction (%)</label>
          <input type="number" id="promo-percent" min={1} max={100} value={form.discountPercent} onChange={update('discountPercent')} />
        </div>
        <div className="form-row checkbox-row" style={{ paddingTop: 22 }}>
          <label htmlFor="promo-requires-code">
            <input
              type="checkbox"
              id="promo-requires-code"
              checked={form.requiresCode}
              onChange={(e) => setForm((f) => ({ ...f, requiresCode: e.target.checked }))}
            />
            Nécessite un code promo
          </label>
        </div>
        {form.requiresCode && (
          <div>
            <label htmlFor="promo-code">Code</label>
            <input type="text" id="promo-code" maxLength={30} placeholder="Ex : BIENVENUE10" value={form.code} onChange={update('code')} />
          </div>
        )}
      </div>
      <p className="form-hint">
        Sans code : le client choisit ce tarif dans un menu au moment de réserver (ex : tarif étudiant).
        Avec code : le client doit saisir ce code exact pour que la réduction s'applique.
      </p>
      <div className="manual-reservation-form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Ajout…' : 'Ajouter'}
        </button>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

function PromotionRow({ promotion, onSave, onRemove }) {
  const showToast = useToast();
  const [label, setLabel] = useState(promotion.label);
  const [discountPercent, setDiscountPercent] = useState(promotion.discount_percent.toString());
  const [code, setCode] = useState(promotion.code || '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave(promotion.id, {
        label: label.trim(),
        discountPercent: Number(discountPercent) || 1,
        ...(promotion.requires_code ? { code: code.trim() } : {}),
      });
      showToast('Promotion mise à jour.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    try {
      await onSave(promotion.id, { active: !promotion.active });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <tr>
      <td data-label="Libellé"><input type="text" value={label} maxLength={100} onChange={(e) => setLabel(e.target.value)} /></td>
      <td data-label="Type">{promotion.requires_code ? 'Code promo' : 'Tarif sélectionnable'}</td>
      <td data-label="Code">
        {promotion.requires_code ? (
          <input type="text" value={code} maxLength={30} onChange={(e) => setCode(e.target.value)} />
        ) : (
          '—'
        )}
      </td>
      <td data-label="Réduction"><input type="number" min={1} max={100} className="stock-price-input" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} /></td>
      <td data-label="Statut">
        <span className={`status-badge ${promotion.active ? 'status-confirmed' : 'status-cancelled'}`}>
          {promotion.active ? 'Active' : 'Désactivée'}
        </span>
      </td>
      <td className="row-actions">
        <button type="button" className="save-btn" onClick={save} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
        <button type="button" onClick={toggleActive}>{promotion.active ? 'Désactiver' : 'Activer'}</button>
        <button type="button" className="danger" onClick={() => onRemove(promotion.id)}>Supprimer</button>
      </td>
    </tr>
  );
}

export default function PromotionsTab() {
  const showToast = useToast();
  const [promotions, setPromotions] = useState(null);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  function load() {
    setError(null);
    apiFetch('/admin/promotions')
      .then(setPromotions)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function savePromotion(id, patch) {
    const updated = await apiFetch(`/admin/promotions/${id}`, { method: 'PATCH', body: patch });
    setPromotions((rows) => rows.map((p) => (p.id === id ? updated : p)));
  }

  async function removePromotion(id) {
    if (!window.confirm('Supprimer définitivement cette promotion ?')) return;
    try {
      await apiFetch(`/admin/promotions/${id}`, { method: 'DELETE' });
      setPromotions((rows) => rows.filter((p) => p.id !== id));
      showToast('Promotion supprimée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <>
      {!showAddForm && (
        <button type="button" className="btn btn-primary btn-sm" style={{ marginBottom: 24 }} onClick={() => setShowAddForm(true)}>
          + Ajouter une promotion
        </button>
      )}

      {showAddForm && (
        <AddPromotionForm
          onCreated={(created) => {
            setPromotions((rows) => [created, ...(rows ?? [])]);
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {error && <p className="loading-text">Erreur : {error}</p>}
      {!error && promotions === null && <p className="loading-text">Chargement…</p>}
      {!error && promotions !== null && promotions.length === 0 && <p className="loading-text">Aucune promotion pour le moment.</p>}

      {!error && promotions !== null && promotions.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Libellé</th>
                <th>Type</th>
                <th>Code</th>
                <th>Réduction</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {promotions.map((p) => (
                <PromotionRow key={p.id} promotion={p} onSave={savePromotion} onRemove={removePromotion} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
