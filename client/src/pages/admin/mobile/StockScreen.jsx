import { useEffect, useState } from 'react';
import { apiFetch } from '../../../api/client';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import { formatPrice } from '../../../utils/format';
import { Badge, Chips, Empty, ErrorText, Fab, Loading, Sheet, TopBar } from './ui';

const isLow = (p) => p.low_stock_threshold > 0 && p.quantity <= p.low_stock_threshold;
const fmtQty = (q) => String(q).replace('.', ',');

function ProductSheet({ product, onClose, onSaved, onDeleted }) {
  const confirm = useConfirm();
  const showToast = useToast();
  const isNew = !product;
  const [form, setForm] = useState({
    name: product?.name ?? '',
    unit: product?.unit ?? 'unité',
    quantity: String(product?.quantity ?? 0),
    threshold: String(product?.low_stock_threshold ?? 0),
    priceEuros: product ? (product.purchase_price_cents / 100).toFixed(2) : '',
    notes: product?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function save() {
    if (!form.name.trim()) return showToast('Le nom est requis.', 'error');
    const body = {
      name: form.name.trim(),
      unit: form.unit.trim() || 'unité',
      quantity: Number(form.quantity) || 0,
      lowStockThreshold: Number(form.threshold) || 0,
      purchasePriceCents: Math.round(Number(form.priceEuros) * 100) || 0,
      notes: form.notes.trim(),
    };
    setSaving(true);
    try {
      const saved = isNew
        ? await apiFetch('/admin/products', { method: 'POST', body })
        : await apiFetch(`/admin/products/${product.id}`, { method: 'PATCH', body });
      showToast(isNew ? 'Produit ajouté.' : 'Produit mis à jour.', 'success');
      onSaved(saved, isNew);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await confirm('Supprimer définitivement ce produit ?'))) return;
    try {
      await apiFetch(`/admin/products/${product.id}`, { method: 'DELETE' });
      showToast('Produit supprimé.', 'success');
      onDeleted(product.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <Sheet
      title={isNew ? 'Nouveau produit' : 'Produit'}
      onClose={onClose}
      left={{ label: 'Annuler', onClick: onClose }}
      right={{ label: saving ? '…' : isNew ? 'Ajouter' : 'Enregistrer', onClick: save, disabled: saving }}
      tall
    >
      <div className="m-field">
        <label htmlFor="m-prod-name">Nom</label>
        <input id="m-prod-name" type="text" maxLength={150} placeholder="Ex : Oxydant 20 vol" value={form.name} onChange={update('name')} />
      </div>
      <div className="m-field-row">
        <div className="m-field">
          <label htmlFor="m-prod-qty">{isNew ? 'Quantité initiale' : 'Quantité'}</label>
          <input id="m-prod-qty" type="number" inputMode="decimal" min={0} step="0.5" value={form.quantity} onChange={update('quantity')} />
        </div>
        <div className="m-field">
          <label htmlFor="m-prod-unit">Unité</label>
          <input id="m-prod-unit" type="text" maxLength={30} placeholder="ml, tube, flacon…" value={form.unit} onChange={update('unit')} />
        </div>
      </div>
      <div className="m-field-row">
        <div className="m-field">
          <label htmlFor="m-prod-threshold">Seuil d'alerte</label>
          <input id="m-prod-threshold" type="number" inputMode="decimal" min={0} step="0.5" value={form.threshold} onChange={update('threshold')} />
        </div>
        <div className="m-field">
          <label htmlFor="m-prod-price">Prix d'achat (€)</label>
          <input id="m-prod-price" type="number" inputMode="decimal" min={0} step="0.01" value={form.priceEuros} onChange={update('priceEuros')} />
        </div>
      </div>
      <div className="m-field">
        <label htmlFor="m-prod-notes">Note (optionnel)</label>
        <input id="m-prod-notes" type="text" maxLength={500} placeholder="Ex : fournisseur, référence…" value={form.notes} onChange={update('notes')} />
      </div>
      {!isNew && <button type="button" className="m-link m-link-danger" onClick={remove}>Supprimer le produit</button>}
    </Sheet>
  );
}

// Stock : alerte « à commander », gros boutons − / + pour ajuster après
// chaque utilisation ou livraison.
export default function StockScreen({ onBack, refreshCounts }) {
  const showToast = useToast();
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    apiFetch('/admin/products').then(setProducts).catch((err) => setError(err.message));
  }, []);

  async function adjust(p, delta) {
    const quantity = Math.max(0, p.quantity + delta);
    setProducts((rows) => rows.map((x) => (x.id === p.id ? { ...x, quantity } : x)));
    try {
      const updated = await apiFetch(`/admin/products/${p.id}`, { method: 'PATCH', body: { quantity } });
      setProducts((rows) => rows.map((x) => (x.id === p.id ? updated : x)));
      refreshCounts();
    } catch (err) {
      setProducts((rows) => rows.map((x) => (x.id === p.id ? p : x)));
      showToast(err.message, 'error');
    }
  }

  const all = products ?? [];
  const low = all.filter(isLow);
  const value = all.reduce((s, p) => s + Math.round(p.quantity * p.purchase_price_cents), 0);
  const list = filter === 'low' ? low : all;

  return (
    <div className="m-screen">
      <TopBar title="Stock" back={{ label: 'Plus', onClick: onBack }} subtitle={products ? `Valeur du stock : ${formatPrice(value)}` : null}>
        <Chips
          label="Filtrer les produits"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Tous', count: all.length },
            { value: 'low', label: 'À commander', count: low.length },
          ]}
        />
      </TopBar>
      {low.length > 0 && filter === 'all' && (
        <p className="m-warning"><strong>À commander :</strong> {low.map((p) => p.name).join(', ')}</p>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      {!error && !products && <Loading />}
      {products && list.length === 0 && <Empty>{filter === 'low' ? 'Rien à commander.' : 'Aucun produit pour le moment.'}</Empty>}
      <div className="m-stack">
        {list.map((p) => (
          <article key={p.id} className="m-card m-card-pad m-product">
            <button type="button" className="m-plain m-product-head" onClick={() => setEditing(p)}>
              <span className="m-grow">
                <strong className="m-block">{p.name}</strong>
                <span className="m-muted m-small">
                  {p.notes ? `${p.notes} · ` : ''}{formatPrice(p.purchase_price_cents)} / {p.unit}
                </span>
              </span>
              <Badge tone={p.quantity === 0 ? 'ko' : isLow(p) ? 'wait' : 'ok'}>{p.quantity === 0 ? 'Épuisé' : isLow(p) ? 'À commander' : 'OK'}</Badge>
            </button>
            <div className="m-product-qty">
              <div className="m-stepper">
                <button type="button" aria-label={`Retirer 1 ${p.name}`} disabled={p.quantity <= 0} onClick={() => adjust(p, -1)}>−</button>
                <span><strong>{fmtQty(p.quantity)}</strong><span className="m-muted m-small m-block">{p.unit}</span></span>
                <button type="button" aria-label={`Ajouter 1 ${p.name}`} onClick={() => adjust(p, 1)}>+</button>
              </div>
              <span className="m-muted m-small m-right">
                {p.low_stock_threshold > 0 ? `seuil ${fmtQty(p.low_stock_threshold)}` : 'pas de seuil'}
                <br />
                {formatPrice(Math.round(p.quantity * p.purchase_price_cents))}
              </span>
            </div>
          </article>
        ))}
      </div>

      <Fab label="Ajouter un produit" onClick={() => setEditing('new')} />

      {editing && (
        <ProductSheet
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, created) => {
            setProducts((rows) => (created ? [...rows, saved] : rows.map((x) => (x.id === saved.id ? saved : x))));
            setEditing(null);
            refreshCounts();
          }}
          onDeleted={(id) => {
            setProducts((rows) => rows.filter((x) => x.id !== id));
            setEditing(null);
            refreshCounts();
          }}
        />
      )}
    </div>
  );
}
