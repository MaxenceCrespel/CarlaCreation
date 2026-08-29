import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../context/ToastContext';

const STATUS_LABELS = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  completed: 'Terminée',
  cancelled: 'Annulée',
  refused: 'Refusée',
};

const EMPTY_CLIENT_FORM = { name: '', phone: '', notes: '' };

function AddClientForm({ onCreated, onCancel, prefill }) {
  const showToast = useToast();
  const [form, setForm] = useState(prefill ? { ...EMPTY_CLIENT_FORM, ...prefill } : EMPTY_CLIENT_FORM);
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const created = await apiFetch('/admin/clients', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          phone: form.phone.trim(),
          notes: form.notes.trim(),
        },
      });
      onCreated(created);
      setForm(EMPTY_CLIENT_FORM);
      showToast('Fiche client créée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
      <h2>Ajouter un client</h2>
      <div className="form-row two-col">
        <div>
          <label htmlFor="client-add-name">Nom</label>
          <input type="text" id="client-add-name" required maxLength={200} value={form.name} onChange={update('name')} />
        </div>
        <div>
          <label htmlFor="client-add-phone">Téléphone</label>
          <input type="text" id="client-add-phone" maxLength={50} value={form.phone} onChange={update('phone')} />
        </div>
      </div>
      <div className="form-row">
        <label htmlFor="client-add-notes">Notes (optionnel)</label>
        <textarea id="client-add-notes" rows={3} maxLength={5000} placeholder="Ex : a fait un 4.1 au dernier rdv…" value={form.notes} onChange={update('notes')} />
      </div>
      <div className="manual-reservation-form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Création…' : 'Créer la fiche'}
        </button>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

function ClientDetail({ client, onClose, onUpdated, onDeleted }) {
  const showToast = useToast();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch(`/admin/clients/${client.id}`)
      .then((data) => {
        setDetail(data);
        setName(data.name);
        setPhone(data.phone);
        setNotes(data.notes);
      })
      .catch((err) => setError(err.message));
  }, [client.id]);

  async function save() {
    setSaving(true);
    try {
      const updated = await apiFetch(`/admin/clients/${client.id}`, {
        method: 'PATCH',
        body: { name: name.trim(), phone: phone.trim(), notes: notes.trim() },
      });
      onUpdated(updated);
      showToast('Fiche mise à jour.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Supprimer définitivement la fiche de ${client.name} ? Ses rendez-vous resteront mais ne seront plus liés.`)) return;
    try {
      await apiFetch(`/admin/clients/${client.id}`, { method: 'DELETE' });
      onDeleted(client.id);
      showToast('Fiche supprimée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Fiche client" onClick={(e) => e.stopPropagation()}>
        <h2>Fiche client</h2>

        {error && <p className="form-feedback error">{error}</p>}
        {!error && !detail && <p className="loading-text">Chargement…</p>}

        {!error && detail && (
          <>
            <div className="form-row two-col">
              <div>
                <label htmlFor="client-detail-name">Nom</label>
                <input type="text" id="client-detail-name" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="client-detail-phone">Téléphone</label>
                <input type="text" id="client-detail-phone" maxLength={50} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="client-detail-notes">Notes</label>
              <textarea id="client-detail-notes" rows={4} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="modal-actions">
              <button type="button" className="danger" onClick={remove}>Supprimer la fiche</button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>

            <div style={{ marginTop: 20 }}>
              <label>Historique des rendez-vous ({detail.history.length})</label>
              {detail.history.length === 0 ? (
                <p className="loading-text">Aucun rendez-vous enregistré sur cette fiche.</p>
              ) : (
                <div className="table-wrap" style={{ marginTop: 8 }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Heure</th>
                        <th>Prestation</th>
                        <th>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.history.map((h) => (
                        <tr key={h.id}>
                          <td data-label="Date">{h.reservation_date}</td>
                          <td data-label="Heure">{h.start_time}</td>
                          <td data-label="Prestation">{h.service_name}</td>
                          <td data-label="Statut"><span className={`status-badge status-${h.status}`}>{STATUS_LABELS[h.status] || h.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

export default function ClientsTab() {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormPrefill, setAddFormPrefill] = useState(null);

  // Settles 300ms after typing stops so a search doesn't fire a request per
  // keystroke — the search now hits the server (it also has to check past
  // reservations' phone numbers, not just fiches already loaded client-side).
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setError(null);
    apiFetch(`/admin/clients${debouncedSearch ? `?q=${encodeURIComponent(debouncedSearch)}` : ''}`)
      .then(setClients)
      .catch((err) => setError(err.message));
  }, [debouncedSearch]);

  function openAddForm(prefill) {
    setAddFormPrefill(prefill ?? null);
    setShowAddForm(true);
  }

  return (
    <>
      {!showAddForm && (
        <button type="button" className="btn btn-primary btn-sm" style={{ marginBottom: 24 }} onClick={() => openAddForm(null)}>
          + Ajouter un client
        </button>
      )}

      {showAddForm && (
        <AddClientForm
          prefill={addFormPrefill}
          onCreated={(created) => {
            setClients((rows) => [...(rows ?? []).filter((c) => c.hasFiche), { ...created, hasFiche: true }].sort((a, b) => a.name.localeCompare(b.name)));
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <label htmlFor="client-search">Rechercher</label>
        <input
          type="text"
          id="client-search"
          placeholder="Nom, téléphone… (retrouve aussi les anciens clients sans fiche)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <p className="loading-text">Erreur : {error}</p>}
      {!error && clients === null && <p className="loading-text">Chargement…</p>}
      {!error && clients !== null && clients.length === 0 && (
        <p className="loading-text">
          {debouncedSearch
            ? 'Aucun résultat pour cette recherche.'
            : 'Aucune fiche client pour le moment — ajoutez-en une ci-dessus, ou liez-en une depuis l\'onglet Réservations.'}
        </p>
      )}

      {!error && clients !== null && clients.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Téléphone</th>
                <th>Rendez-vous</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) =>
                c.hasFiche ? (
                  <tr key={c.id}>
                    <td data-label="Nom">{c.name}</td>
                    <td data-label="Téléphone">{c.phone || '—'}</td>
                    <td data-label="Rendez-vous">{c.reservationCount}</td>
                    <td data-label="Note">{c.notes ? c.notes.slice(0, 60) + (c.notes.length > 60 ? '…' : '') : '—'}</td>
                    <td className="row-actions">
                      <button type="button" onClick={() => setSelected(c)}>Voir la fiche</button>
                    </td>
                  </tr>
                ) : (
                  // Matched via past reservations only — no fiche exists yet
                  // for this person (the "un appel d'un numéro inconnu qui
                  // est en fait déjà cliente" case).
                  <tr key={`history-${c.phone}-${c.name}`} className="is-no-fiche">
                    <td data-label="Nom">
                      {c.name} <span className="badge-no-fiche">Pas de fiche</span>
                    </td>
                    <td data-label="Téléphone">{c.phone || '—'}</td>
                    <td data-label="Rendez-vous">—</td>
                    <td data-label="Note">—</td>
                    <td className="row-actions">
                      <button type="button" onClick={() => openAddForm({ name: c.name, phone: c.phone })}>Créer une fiche</button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <ClientDetail
          client={selected}
          onClose={() => setSelected(null)}
          onUpdated={(updated) => {
            setClients((rows) => rows.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
            setSelected(null);
          }}
          onDeleted={(id) => {
            setClients((rows) => rows.filter((c) => c.id !== id));
            setSelected(null);
          }}
        />
      )}
    </>
  );
}
