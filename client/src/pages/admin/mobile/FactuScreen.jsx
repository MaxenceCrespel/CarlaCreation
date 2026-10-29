import { useEffect, useState } from 'react';
import { apiFetch } from '../../../api/client';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import { formatPrice } from '../../../utils/format';
import { Badge, Chips, Empty, ErrorText, Fab, Icon, Loading, Sheet, TopBar } from './ui';
import { addDays, formatDayShort, todayStr } from './helpers';

const METHODS = ['Carte bancaire', 'Espèces', 'Virement', 'Chèque'];

let itemSeq = 0;
const emptyItem = () => ({ key: (itemSeq += 1), description: '', quantity: '1', priceEuros: '' });

function InvoiceSheet({ invoice, onClose, onChanged, onDeleted }) {
  const confirm = useConfirm();
  const showToast = useToast();
  const [method, setMethod] = useState(invoice.payment_method || 'Carte bancaire');
  const [working, setWorking] = useState(false);
  const paid = invoice.status === 'paid';

  async function setStatus(body, text) {
    setWorking(true);
    try {
      const updated = await apiFetch(`/admin/invoices/${invoice.id}/status`, { method: 'PATCH', body });
      showToast(text, 'success');
      onChanged(updated);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWorking(false);
    }
  }

  async function remove() {
    if (!(await confirm('Supprimer définitivement cette facture ?'))) return;
    try {
      await apiFetch(`/admin/invoices/${invoice.id}`, { method: 'DELETE' });
      showToast('Facture supprimée.', 'success');
      onDeleted(invoice.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <Sheet title={`Facture ${invoice.number}`} onClose={onClose}>
      <div className="m-rdv-head">
        <Badge tone={paid ? 'ok' : 'ko'}>{paid ? `Payée${invoice.payment_method ? ` · ${invoice.payment_method}` : ''}` : 'Impayée'}</Badge>
        <h3 className="m-rdv-name">{invoice.client_name}</h3>
        <p className="m-muted">Émise le {new Date(invoice.issue_date).toLocaleDateString('fr-FR')}</p>
      </div>
      <div className="m-card m-card-pad">
        {(invoice.items ?? []).map((item) => (
          <div key={item.id} className="m-line">
            <span>{item.description}{Number(item.quantity) !== 1 ? <span className="m-muted"> × {String(item.quantity).replace('.', ',')}</span> : ''}</span>
            <span>{formatPrice(Math.round(item.quantity * item.unit_price_cents))}</span>
          </div>
        ))}
        <div className="m-line m-line-total">
          <strong>Total</strong>
          <strong>{formatPrice(invoice.total_cents)}</strong>
        </div>
      </div>
      {invoice.notes && <p className="m-muted">Note : {invoice.notes}</p>}

      {paid ? (
        <button type="button" className="m-link m-link-muted" disabled={working} onClick={() => setStatus({ status: 'unpaid' }, 'Facture marquée non payée.')}>
          Annuler le paiement
        </button>
      ) : (
        <div className="m-field">
          <span className="m-label">Encaisser</span>
          <div className="m-percents">
            {METHODS.map((m) => (
              <button key={m} type="button" aria-pressed={method === m} className={`m-percent ${method === m ? 'is-on' : ''}`} onClick={() => setMethod(m)}>{m}</button>
            ))}
          </div>
          <input type="text" aria-label="Autre moyen de paiement" value={method} onChange={(e) => setMethod(e.target.value)} />
          <button
            type="button"
            className="m-btn m-btn-ok m-btn-block"
            disabled={working}
            onClick={() => setStatus({ status: 'paid', paymentMethod: method.trim() || undefined }, 'Facture marquée payée.')}
          >
            Marquer payée · {formatPrice(invoice.total_cents)}
          </button>
        </div>
      )}

      <a className="m-btn m-btn-block" href={`/api/admin/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
        <Icon name="external" size={18} /> Ouvrir le PDF
      </a>
      <button type="button" className="m-link m-link-danger" onClick={remove}>Supprimer la facture</button>
    </Sheet>
  );
}

function NewInvoiceSheet({ reservations, fromReservation, onClose, onCreated }) {
  const showToast = useToast();
  const [reservationId, setReservationId] = useState(fromReservation ? String(fromReservation) : '');
  const [form, setForm] = useState({ clientName: '', clientEmail: '', clientPhone: '', clientAddress: '', notes: '' });
  const [items, setItems] = useState([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const updateItem = (key, patch) => setItems((rows) => rows.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  // Recent reservations to start from (newest first) — the last 60 days and
  // anything upcoming, so the list stays short.
  const since = addDays(todayStr(), -60);
  const recent = (reservations ?? [])
    .filter((r) => r.reservation_date >= since && ['confirmed', 'completed'].includes(r.status))
    .sort((a, b) => (b.reservation_date + b.start_time).localeCompare(a.reservation_date + a.start_time));

  useEffect(() => {
    if (!reservationId) return;
    apiFetch(`/admin/invoices/draft-from-reservation/${reservationId}`)
      .then((draft) => {
        setForm((f) => ({ ...f, clientName: draft.clientName, clientEmail: draft.clientEmail, clientPhone: draft.clientPhone, clientAddress: draft.clientAddress }));
        setItems(draft.items.length ? draft.items.map((i) => ({ key: (itemSeq += 1), description: i.description, quantity: String(i.quantity ?? 1), priceEuros: (i.unitPriceCents / 100).toFixed(2) })) : [emptyItem()]);
      })
      .catch((err) => showToast(err.message, 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  const payloadItems = items
    .filter((i) => i.description.trim())
    .map((i) => ({ description: i.description.trim(), quantity: Number(i.quantity) || 1, unitPriceCents: Math.round(Number(i.priceEuros) * 100) || 0 }));
  const totalCents = payloadItems.reduce((s, i) => s + Math.round(i.quantity * i.unitPriceCents), 0);

  async function create() {
    if (!form.clientName.trim() || payloadItems.length === 0) return showToast('Renseignez la cliente et au moins une ligne.', 'error');
    setSaving(true);
    try {
      const created = await apiFetch('/admin/invoices', {
        method: 'POST',
        body: {
          reservationId: reservationId ? Number(reservationId) : undefined,
          clientName: form.clientName.trim(),
          clientEmail: form.clientEmail.trim(),
          clientPhone: form.clientPhone.trim(),
          clientAddress: form.clientAddress.trim(),
          notes: form.notes.trim(),
          items: payloadItems,
        },
      });
      showToast('Facture créée.', 'success');
      onCreated(created);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      title="Nouvelle facture"
      onClose={onClose}
      left={{ label: 'Annuler', onClick: onClose }}
      tall
      footer={
        <button type="button" className="m-btn m-btn-primary m-btn-block" disabled={saving} onClick={create}>
          {saving ? 'Création…' : `Créer la facture · ${formatPrice(totalCents)}`}
        </button>
      }
    >
      <div className="m-field">
        <label htmlFor="m-inv-rdv">Pré-remplir depuis un rendez-vous</label>
        <select id="m-inv-rdv" value={reservationId} onChange={(e) => setReservationId(e.target.value)}>
          <option value="">Aucun (facture libre)</option>
          {recent.map((r) => (
            <option key={r.id} value={r.id}>{formatDayShort(r.reservation_date)} · {r.client_name} · {r.service_name}</option>
          ))}
        </select>
      </div>
      <div className="m-field">
        <label htmlFor="m-inv-name">Nom de la cliente</label>
        <input id="m-inv-name" type="text" maxLength={200} value={form.clientName} onChange={update('clientName')} />
      </div>
      <div className="m-field-row">
        <div className="m-field">
          <label htmlFor="m-inv-phone">Téléphone</label>
          <input id="m-inv-phone" type="tel" maxLength={50} value={form.clientPhone} onChange={update('clientPhone')} />
        </div>
        <div className="m-field">
          <label htmlFor="m-inv-email">Email</label>
          <input id="m-inv-email" type="email" maxLength={200} value={form.clientEmail} onChange={update('clientEmail')} />
        </div>
      </div>
      <div className="m-field">
        <label htmlFor="m-inv-address">Adresse</label>
        <input id="m-inv-address" type="text" maxLength={300} value={form.clientAddress} onChange={update('clientAddress')} />
      </div>
      <div className="m-field">
        <span className="m-label">Lignes</span>
        {items.map((item, i) => (
          <div key={item.key} className="m-addon">
            <input type="text" aria-label={`Description ligne ${i + 1}`} placeholder="Description" value={item.description} onChange={(e) => updateItem(item.key, { description: e.target.value })} />
            <div className="m-field-row">
              <input type="number" inputMode="decimal" aria-label={`Quantité ligne ${i + 1}`} min={0.01} step="0.01" placeholder="Qté" value={item.quantity} onChange={(e) => updateItem(item.key, { quantity: e.target.value })} />
              <input type="number" inputMode="decimal" aria-label={`Prix unitaire ligne ${i + 1}`} step="0.01" placeholder="Prix (€)" value={item.priceEuros} onChange={(e) => updateItem(item.key, { priceEuros: e.target.value })} />
              {items.length > 1 && (
                <button type="button" className="m-round-btn" aria-label={`Retirer la ligne ${i + 1}`} onClick={() => setItems((rows) => rows.filter((x) => x.key !== item.key))}>
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
        <button type="button" className="m-btn m-btn-block" onClick={() => setItems((rows) => [...rows, emptyItem()])}>+ Ajouter une ligne</button>
      </div>
      <div className="m-field">
        <label htmlFor="m-inv-notes">Note (optionnel)</label>
        <input id="m-inv-notes" type="text" maxLength={2000} value={form.notes} onChange={update('notes')} />
      </div>
    </Sheet>
  );
}

// Facturation : totaux du mois, filtre « impayées », encaissement en deux
// gestes et création depuis un rendez-vous.
export default function FactuScreen({ onBack, refreshCounts, reservations, fromReservation }) {
  const [invoices, setInvoices] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(Boolean(fromReservation));

  useEffect(() => {
    apiFetch('/admin/invoices').then(setInvoices).catch((err) => setError(err.message));
  }, []);

  const all = invoices ?? [];
  const month = todayStr().slice(0, 7);
  const thisMonth = all.filter((i) => String(i.issue_date).slice(0, 7) === month);
  const sum = (rows) => rows.reduce((s, i) => s + i.total_cents, 0);
  const unpaid = all.filter((i) => i.status !== 'paid');
  const list = all.filter((i) => (filter === 'unpaid' ? i.status !== 'paid' : filter === 'paid' ? i.status === 'paid' : true));
  const current = all.find((i) => i.id === openId);

  return (
    <div className="m-screen">
      <TopBar title="Facturation" back={{ label: 'Plus', onClick: onBack }}>
        <div className="m-totals">
          <div><span className="m-muted">Ce mois</span><strong>{formatPrice(sum(thisMonth))}</strong></div>
          <div className="is-ok"><span>Encaissé ce mois</span><strong>{formatPrice(sum(thisMonth.filter((i) => i.status === 'paid')))}</strong></div>
          <div className="is-ko"><span>Impayé</span><strong>{formatPrice(sum(unpaid))}</strong></div>
        </div>
        <Chips
          label="Filtrer les factures"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Toutes', count: all.length },
            { value: 'unpaid', label: 'Impayées', count: unpaid.length },
            { value: 'paid', label: 'Payées' },
          ]}
        />
      </TopBar>
      {error && <ErrorText>{error}</ErrorText>}
      {!error && !invoices && <Loading />}
      {invoices && list.length === 0 && <Empty>Aucune facture ici.</Empty>}
      {list.length > 0 && (
        <div className="m-card m-list">
          {list.map((i) => (
            <button key={i.id} type="button" className="m-list-item" onClick={() => setOpenId(i.id)}>
              <span className="m-grow">
                <strong className="m-ellipsis">{i.client_name}</strong>
                <span className="m-muted m-ellipsis"><span className="m-mono">{i.number}</span> · {new Date(i.issue_date).toLocaleDateString('fr-FR')}</span>
              </span>
              <span className="m-amount">
                <strong>{formatPrice(i.total_cents)}</strong>
                <Badge tone={i.status === 'paid' ? 'ok' : 'ko'}>{i.status === 'paid' ? 'Payée' : 'Impayée'}</Badge>
              </span>
            </button>
          ))}
        </div>
      )}

      <Fab label="Nouvelle facture" onClick={() => setCreating(true)} />

      {current && (
        <InvoiceSheet
          invoice={current}
          onClose={() => setOpenId(null)}
          onChanged={(updated) => {
            setInvoices((rows) => rows.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
            refreshCounts();
          }}
          onDeleted={(id) => {
            setInvoices((rows) => rows.filter((x) => x.id !== id));
            setOpenId(null);
            refreshCounts();
          }}
        />
      )}
      {creating && (
        <NewInvoiceSheet
          reservations={reservations}
          fromReservation={fromReservation}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setInvoices((rows) => [created, ...(rows ?? [])]);
            setCreating(false);
            refreshCounts();
          }}
        />
      )}
    </div>
  );
}
