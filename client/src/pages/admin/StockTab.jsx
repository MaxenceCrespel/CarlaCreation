import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { formatPrice } from '../../utils/format';

const EMPTY_FORM = { name: '', unit: 'unité', quantity: '0', lowStockThreshold: '0', purchasePriceEuros: '0.00', notes: '' };

function AddProductForm({ onCreated, onCancel }) {
  const showToast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const created = await apiFetch('/admin/products', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          unit: form.unit.trim() || 'unité',
          quantity: Number(form.quantity) || 0,
          lowStockThreshold: Number(form.lowStockThreshold) || 0,
          purchasePriceCents: Math.round(Number(form.purchasePriceEuros) * 100) || 0,
          notes: form.notes.trim(),
        },
      });
      onCreated(created);
      setForm(EMPTY_FORM);
      showToast('Produit ajouté.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
      <h2>Ajouter un produit</h2>
      <div className="form-row four-col">
        <div>
          <label htmlFor="product-name">Nom</label>
          <input type="text" id="product-name" required maxLength={150} placeholder="Ex : Oxydant 20 vol" value={form.name} onChange={update('name')} />
        </div>
        <div>
          <label htmlFor="product-unit">Unité</label>
          <input type="text" id="product-unit" maxLength={30} placeholder="ml, tube, flacon…" value={form.unit} onChange={update('unit')} />
        </div>
        <div>
          <label htmlFor="product-quantity">Quantité initiale</label>
          <input type="number" id="product-quantity" min={0} step="0.5" value={form.quantity} onChange={update('quantity')} />
        </div>
        <div>
          <label htmlFor="product-threshold">Seuil d'alerte</label>
          <input type="number" id="product-threshold" min={0} step="0.5" value={form.lowStockThreshold} onChange={update('lowStockThreshold')} />
        </div>
      </div>
      <div className="form-row">
        <div>
          <label htmlFor="product-price">Prix d'achat unitaire (€)</label>
          <input type="number" id="product-price" min={0} step="0.01" value={form.purchasePriceEuros} onChange={update('purchasePriceEuros')} />
        </div>
        <div>
          <label htmlFor="product-notes">Note (optionnel)</label>
          <input type="text" id="product-notes" maxLength={500} placeholder="Ex : fournisseur, référence…" value={form.notes} onChange={update('notes')} />
        </div>
      </div>
      <div className="manual-reservation-form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Ajout…' : 'Ajouter'}
        </button>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

function ProductRow({ product, onAdjust, onSave, onRemove }) {
  const showToast = useToast();
  const [name, setName] = useState(product.name);
  const [unit, setUnit] = useState(product.unit);
  const [threshold, setThreshold] = useState(product.low_stock_threshold.toString());
  const [priceEuros, setPriceEuros] = useState((product.purchase_price_cents / 100).toFixed(2));
  const [notes, setNotes] = useState(product.notes);
  const [quantityInput, setQuantityInput] = useState(product.quantity.toString());
  const [saving, setSaving] = useState(false);

  const isLow = product.low_stock_threshold > 0 && product.quantity <= product.low_stock_threshold;
  const stockValueCents = Math.round(product.quantity * product.purchase_price_cents);

  async function adjust(delta) {
    const next = Math.max(0, product.quantity + delta);
    setQuantityInput(next.toString());
    try {
      await onAdjust(product.id, next);
    } catch (err) {
      showToast(err.message, 'error');
      setQuantityInput(product.quantity.toString());
    }
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(product.id, {
        name: name.trim(),
        unit: unit.trim(),
        quantity: Number(quantityInput) || 0,
        lowStockThreshold: Number(threshold) || 0,
        purchasePriceCents: Math.round(Number(priceEuros) * 100) || 0,
        notes: notes.trim(),
      });
      showToast('Produit mis à jour.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className={isLow ? 'stock-row-low' : ''}>
      <td data-label="Nom"><input type="text" value={name} maxLength={150} onChange={(e) => setName(e.target.value)} /></td>
      <td className="stock-quantity-cell" data-label="Quantité">
        <button type="button" className="stock-adjust-btn" onClick={() => adjust(-1)} aria-label="Retirer 1">−</button>
        <input
          type="number"
          className="stock-quantity-input"
          min={0}
          step="0.5"
          value={quantityInput}
          onChange={(e) => setQuantityInput(e.target.value)}
        />
        <button type="button" className="stock-adjust-btn" onClick={() => adjust(1)} aria-label="Ajouter 1">+</button>
        {isLow && <span className="stock-low-badge">Stock bas</span>}
      </td>
      <td data-label="Unité"><input type="text" value={unit} maxLength={30} onChange={(e) => setUnit(e.target.value)} /></td>
      <td data-label="Seuil d'alerte"><input type="number" min={0} step="0.5" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></td>
      <td data-label="Prix d'achat">
        <input type="number" min={0} step="0.01" className="stock-price-input" value={priceEuros} onChange={(e) => setPriceEuros(e.target.value)} />
        <div className="row-addons">{formatPrice(stockValueCents)} au total</div>
      </td>
      <td data-label="Note"><input type="text" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} /></td>
      <td className="row-actions">
        <button type="button" className="save-btn" onClick={save} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
        <button type="button" className="danger" onClick={() => onRemove(product.id)}>Supprimer</button>
      </td>
    </tr>
  );
}

export default function StockTab() {
  const showToast = useToast();
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  function load() {
    setError(null);
    apiFetch('/admin/products')
      .then(setProducts)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function adjustQuantity(id, quantity) {
    const updated = await apiFetch(`/admin/products/${id}`, { method: 'PATCH', body: { quantity } });
    setProducts((rows) => rows.map((p) => (p.id === id ? updated : p)));
  }

  async function saveProduct(id, patch) {
    const updated = await apiFetch(`/admin/products/${id}`, { method: 'PATCH', body: patch });
    setProducts((rows) => rows.map((p) => (p.id === id ? updated : p)));
  }

  async function removeProduct(id) {
    if (!window.confirm('Supprimer définitivement ce produit ?')) return;
    try {
      await apiFetch(`/admin/products/${id}`, { method: 'DELETE' });
      setProducts((rows) => rows.filter((p) => p.id !== id));
      showToast('Produit supprimé.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const lowStockCount = (products ?? []).filter((p) => p.low_stock_threshold > 0 && p.quantity <= p.low_stock_threshold).length;
  const totalStockValueCents = (products ?? []).reduce((sum, p) => sum + Math.round(p.quantity * p.purchase_price_cents), 0);

  return (
    <>
      {!showAddForm && (
        <button type="button" className="btn btn-primary btn-sm" style={{ marginBottom: 24 }} onClick={() => setShowAddForm(true)}>
          + Ajouter un produit
        </button>
      )}

      {showAddForm && (
        <AddProductForm
          onCreated={(created) => {
            setProducts((rows) => [...(rows ?? []), created]);
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {products !== null && products.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 0 }}>Valeur totale du stock : {formatPrice(totalStockValueCents)}</h2>
        </div>
      )}

      {lowStockCount > 0 && (
        <p className="form-feedback error" style={{ marginBottom: 16 }}>
          {lowStockCount} produit{lowStockCount > 1 ? 's' : ''} en stock bas.
        </p>
      )}

      {error && <p className="loading-text">Erreur : {error}</p>}
      {!error && products === null && <p className="loading-text">Chargement…</p>}
      {!error && products !== null && products.length === 0 && <p className="loading-text">Aucun produit pour le moment.</p>}

      {!error && products !== null && products.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Quantité</th>
                <th>Unité</th>
                <th>Seuil d'alerte</th>
                <th>Prix d'achat</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <ProductRow key={p.id} product={p} onAdjust={adjustQuantity} onSave={saveProduct} onRemove={removeProduct} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
