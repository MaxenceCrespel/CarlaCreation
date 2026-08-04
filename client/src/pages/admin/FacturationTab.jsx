import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { formatPrice } from '../../utils/format';

let itemKeySeq = 0;
function emptyItem() {
  itemKeySeq += 1;
  return { key: `item-${itemKeySeq}`, description: '', quantity: '1', priceEuros: '0.00' };
}

function ItemEditor({ items, onChange }) {
  function addRow() {
    onChange([...items, emptyItem()]);
  }
  function removeRow(key) {
    onChange(items.filter((i) => i.key !== key));
  }
  function updateRow(key, patch) {
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  return (
    <div className="addon-editor">
      <label>Lignes de la facture</label>
      {items.map((item) => (
        <div className="addon-row" key={item.key}>
          <input
            type="text"
            placeholder="Description"
            value={item.description}
            onChange={(e) => updateRow(item.key, { description: e.target.value })}
          />
          <input
            type="number"
            min={0.01}
            step="0.01"
            title="Quantité"
            value={item.quantity}
            onChange={(e) => updateRow(item.key, { quantity: e.target.value })}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            title="Prix unitaire (€)"
            value={item.priceEuros}
            onChange={(e) => updateRow(item.key, { priceEuros: e.target.value })}
          />
          {items.length > 1 && (
            <button type="button" className="range-remove-btn" onClick={() => removeRow(item.key)}>Retirer</button>
          )}
        </div>
      ))}
      <button type="button" className="btn btn-outline btn-sm add-range-btn" onClick={addRow}>
        + Ajouter une ligne
      </button>
    </div>
  );
}

function itemsToPayload(items) {
  return items
    .filter((i) => i.description.trim())
    .map((i) => ({
      description: i.description.trim(),
      quantity: Number(i.quantity) || 1,
      unitPriceCents: Math.round(Number(i.priceEuros) * 100) || 0,
    }));
}

const EMPTY_FORM = {
  reservationId: '',
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  clientAddress: '',
  notes: '',
};

function NewInvoiceForm({ onCreated }) {
  const showToast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState([emptyItem()]);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function loadFromReservation() {
    if (!form.reservationId) return;
    setLoadingDraft(true);
    try {
      const draft = await apiFetch(`/admin/invoices/draft-from-reservation/${form.reservationId}`);
      setForm((f) => ({
        ...f,
        clientName: draft.clientName,
        clientEmail: draft.clientEmail,
        clientPhone: draft.clientPhone,
        clientAddress: draft.clientAddress,
      }));
      setItems(
        draft.items.length
          ? draft.items.map((i) => {
              itemKeySeq += 1;
              return { key: `item-${itemKeySeq}`, description: i.description, quantity: '1', priceEuros: (i.unitPriceCents / 100).toFixed(2) };
            })
          : [emptyItem()],
      );
      showToast('Réservation chargée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingDraft(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payloadItems = itemsToPayload(items);
    if (!form.clientName.trim() || payloadItems.length === 0) {
      showToast('Renseignez le client et au moins une ligne.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const created = await apiFetch('/admin/invoices', {
        method: 'POST',
        body: {
          reservationId: form.reservationId ? Number(form.reservationId) : undefined,
          clientName: form.clientName.trim(),
          clientEmail: form.clientEmail.trim(),
          clientPhone: form.clientPhone.trim(),
          clientAddress: form.clientAddress.trim(),
          notes: form.notes.trim(),
          items: payloadItems,
        },
      });
      onCreated(created);
      setForm(EMPTY_FORM);
      setItems([emptyItem()]);
      showToast('Facture créée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
      <h2>Nouvelle facture</h2>

      <div className="form-row" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="invoice-reservation-id">Depuis une réservation (n° optionnel)</label>
          <input
            type="number"
            id="invoice-reservation-id"
            min={1}
            value={form.reservationId}
            onChange={update('reservationId')}
          />
        </div>
        <button type="button" className="btn btn-outline" disabled={!form.reservationId || loadingDraft} onClick={loadFromReservation}>
          {loadingDraft ? 'Chargement…' : 'Charger'}
        </button>
      </div>

      <div className="form-row four-col">
        <div>
          <label htmlFor="invoice-client-name">Nom du client</label>
          <input type="text" id="invoice-client-name" required maxLength={200} value={form.clientName} onChange={update('clientName')} />
        </div>
        <div>
          <label htmlFor="invoice-client-email">Email</label>
          <input type="email" id="invoice-client-email" maxLength={200} value={form.clientEmail} onChange={update('clientEmail')} />
        </div>
        <div>
          <label htmlFor="invoice-client-phone">Téléphone</label>
          <input type="text" id="invoice-client-phone" maxLength={50} value={form.clientPhone} onChange={update('clientPhone')} />
        </div>
        <div>
          <label htmlFor="invoice-client-address">Adresse</label>
          <input type="text" id="invoice-client-address" maxLength={300} value={form.clientAddress} onChange={update('clientAddress')} />
        </div>
      </div>

      <ItemEditor items={items} onChange={setItems} />

      <div className="form-row">
        <label htmlFor="invoice-notes">Note (optionnel)</label>
        <input type="text" id="invoice-notes" maxLength={2000} value={form.notes} onChange={update('notes')} />
      </div>

      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Création…' : 'Créer la facture'}
      </button>
    </form>
  );
}

function InvoiceRow({ invoice, onStatusChange, onRemove }) {
  const showToast = useToast();
  const [paymentMethod, setPaymentMethod] = useState(invoice.payment_method ?? '');
  const [updating, setUpdating] = useState(false);

  async function markPaid() {
    setUpdating(true);
    try {
      await onStatusChange(invoice.id, { status: 'paid', paymentMethod: paymentMethod.trim() || undefined });
      showToast('Facture marquée payée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUpdating(false);
    }
  }

  async function markUnpaid() {
    setUpdating(true);
    try {
      await onStatusChange(invoice.id, { status: 'unpaid' });
      showToast('Facture marquée non payée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <tr>
      <td>{invoice.number}</td>
      <td>{new Date(invoice.issue_date).toLocaleDateString('fr-FR')}</td>
      <td>
        {invoice.client_name}
        {invoice.client_email && <div className="row-addons">{invoice.client_email}</div>}
      </td>
      <td>{formatPrice(invoice.total_cents)}</td>
      <td className="status-cell">
        <span className={`status-badge ${invoice.status === 'paid' ? 'status-confirmed' : 'status-pending'}`}>
          {invoice.status === 'paid' ? 'Payée' : 'Non payée'}
        </span>
        {invoice.status === 'unpaid' ? (
          <>
            <input
              type="text"
              placeholder="Moyen de paiement"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              style={{ width: 130 }}
            />
            <button type="button" className="save-btn" disabled={updating} onClick={markPaid}>Marquer payée</button>
          </>
        ) : (
          <button type="button" onClick={markUnpaid} disabled={updating}>Annuler le paiement</button>
        )}
      </td>
      <td className="row-actions">
        <a className="btn btn-outline btn-sm" href={`/api/admin/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
          Télécharger PDF
        </a>
        <button type="button" className="danger" onClick={() => onRemove(invoice.id)}>Supprimer</button>
      </td>
    </tr>
  );
}

export default function FacturationTab() {
  const showToast = useToast();
  const [invoices, setInvoices] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    setError(null);
    apiFetch('/admin/invoices')
      .then(setInvoices)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function updateStatus(id, dto) {
    const updated = await apiFetch(`/admin/invoices/${id}/status`, { method: 'PATCH', body: dto });
    setInvoices((rows) => rows.map((inv) => (inv.id === id ? updated : inv)));
  }

  async function removeInvoice(id) {
    if (!window.confirm('Supprimer définitivement cette facture ?')) return;
    try {
      await apiFetch(`/admin/invoices/${id}`, { method: 'DELETE' });
      setInvoices((rows) => rows.filter((inv) => inv.id !== id));
      showToast('Facture supprimée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <>
      <NewInvoiceForm onCreated={(created) => setInvoices((rows) => [created, ...(rows ?? [])])} />

      {error && <p className="loading-text">Erreur : {error}</p>}
      {!error && invoices === null && <p className="loading-text">Chargement…</p>}
      {!error && invoices !== null && invoices.length === 0 && <p className="loading-text">Aucune facture pour le moment.</p>}

      {!error && invoices !== null && invoices.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Date</th>
                <th>Client</th>
                <th>Total</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <InvoiceRow key={inv.id} invoice={inv} onStatusChange={updateStatus} onRemove={removeInvoice} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
