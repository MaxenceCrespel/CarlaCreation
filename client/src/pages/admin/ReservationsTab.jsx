import { Fragment, useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../context/ToastContext';

const STATUS_LABELS = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  completed: 'Terminée',
  cancelled: 'Annulée',
  refused: 'Refusée',
};

const EMPTY_GUEST = () => ({ key: Date.now() + Math.random(), name: '', serviceId: '' });

const EMPTY_MANUAL_FORM = {
  serviceId: '',
  date: '',
  startTime: '',
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  clientAddress: '',
  notes: '',
  status: 'confirmed',
  atClientHome: false,
};

function AddReservationForm({ onCreated, onCancel }) {
  const showToast = useToast();
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(EMPTY_MANUAL_FORM);
  const [guests, setGuests] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch('/admin/services').then(setServices).catch(() => showToast('Impossible de charger les prestations.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function addGuest() {
    setGuests((g) => [...g, EMPTY_GUEST()]);
  }
  function removeGuest(key) {
    setGuests((g) => g.filter((guest) => guest.key !== key));
  }
  function updateGuest(key, patch) {
    setGuests((g) => g.map((guest) => (guest.key === key ? { ...guest, ...patch } : guest)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);

    if (!e.target.checkValidity()) {
      e.target.reportValidity();
      return;
    }
    if (guests.some((g) => !g.name.trim() || !g.serviceId)) {
      setFeedback('Complétez le nom et la prestation de chaque personne ajoutée, ou retirez-la.');
      return;
    }
    if (form.atClientHome && !form.clientAddress.trim()) {
      setFeedback('Indiquez une adresse pour un rendez-vous à domicile.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/reservations/manual', {
        method: 'POST',
        body: {
          ...form,
          serviceId: Number(form.serviceId),
          clientAddress: form.atClientHome ? form.clientAddress.trim() : undefined,
          additionalGuests: guests.map((g) => ({ name: g.name.trim(), serviceId: Number(g.serviceId) })),
        },
      });
      showToast('Réservation ajoutée.', 'success');
      onCreated();
    } catch (err) {
      setFeedback(err.message);
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card manual-reservation-form" noValidate onSubmit={handleSubmit}>
      <h2>Ajouter une réservation manuellement</h2>
      <p className="section-lead">
        Pour enregistrer un rendez-vous pris par téléphone ou en personne. Le créneau est vérifié pour éviter
        tout chevauchement, mais les horaires du jour ne sont pas imposés (utile pour un ajout rétroactif).
        Ajoutez d'autres personnes ci-dessous pour un rendez-vous groupé (ex : une mère et sa fille) — elles
        seront enchaînées à la suite dans le même créneau.
      </p>

      <div className="form-row">
        <label htmlFor="manual-service">Prestation (personne 1)</label>
        <select id="manual-service" required value={form.serviceId} onChange={update('serviceId')}>
          <option value="" disabled>Choisissez une prestation</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              [{s.category === 'ongles' ? 'Ongles' : 'Coiffure'}] {s.name}
              {!s.active ? ' (inactive)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row two-col">
        <div>
          <label htmlFor="manual-date">Date</label>
          <input type="date" id="manual-date" required value={form.date} onChange={update('date')} />
        </div>
        <div>
          <label htmlFor="manual-time">Heure de début</label>
          <input type="time" id="manual-time" required value={form.startTime} onChange={update('startTime')} />
        </div>
      </div>

      <div className="form-row">
        <label htmlFor="manual-name">Nom (personne 1)</label>
        <input type="text" id="manual-name" required minLength={2} maxLength={100} value={form.clientName} onChange={update('clientName')} />
      </div>

      {guests.map((guest, i) => (
        <div className="guest-block" key={guest.key}>
          <div className="guest-block-header">
            <label htmlFor={`manual-guest-name-${guest.key}`}>Personne {i + 2}</label>
            <button type="button" className="guest-remove-btn" onClick={() => removeGuest(guest.key)}>Retirer</button>
          </div>
          <input
            type="text"
            id={`manual-guest-name-${guest.key}`}
            required
            minLength={2}
            maxLength={100}
            placeholder="Nom complet"
            value={guest.name}
            onChange={(e) => updateGuest(guest.key, { name: e.target.value })}
          />
          <select required value={guest.serviceId} onChange={(e) => updateGuest(guest.key, { serviceId: e.target.value })}>
            <option value="" disabled>Choisissez une prestation</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                [{s.category === 'ongles' ? 'Ongles' : 'Coiffure'}] {s.name}
              </option>
            ))}
          </select>
        </div>
      ))}

      <button type="button" className="btn btn-outline add-guest-btn" onClick={addGuest}>
        + Ajouter une personne
      </button>

      <div className="form-row two-col">
        <div>
          <label htmlFor="manual-email">Email</label>
          <input type="email" id="manual-email" required value={form.clientEmail} onChange={update('clientEmail')} />
        </div>
        <div>
          <label htmlFor="manual-phone">Téléphone</label>
          <input type="tel" id="manual-phone" required placeholder="06 12 34 56 78" value={form.clientPhone} onChange={update('clientPhone')} />
        </div>
      </div>

      <div className="form-row checkbox-row">
        <label htmlFor="manual-at-home">
          <input
            type="checkbox"
            id="manual-at-home"
            checked={form.atClientHome}
            onChange={(e) => setForm((f) => ({ ...f, atClientHome: e.target.checked }))}
          />
          Rendez-vous à domicile (Carla se déplace)
        </label>
      </div>

      {form.atClientHome && (
        <div className="form-row">
          <label htmlFor="manual-address">Adresse du client·e</label>
          <input
            type="text"
            id="manual-address"
            required
            minLength={5}
            maxLength={300}
            value={form.clientAddress}
            onChange={update('clientAddress')}
          />
        </div>
      )}

      <div className="form-row two-col">
        <div>
          <label htmlFor="manual-status">Statut</label>
          <select id="manual-status" value={form.status} onChange={update('status')}>
            <option value="confirmed">Confirmée</option>
            <option value="pending">En attente</option>
            <option value="completed">Terminée</option>
          </select>
        </div>
        <div>
          <label htmlFor="manual-notes">Note (optionnel)</label>
          <input type="text" id="manual-notes" maxLength={500} value={form.notes} onChange={update('notes')} />
        </div>
      </div>

      {feedback && <div className="form-feedback error">{feedback}</div>}

      <div className="manual-reservation-form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Ajout en cours…' : 'Ajouter la réservation'}
        </button>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

// Consecutive rows sharing a group_id (e.g. mother + daughter booked
// together) are shown as one visual group with bulk actions, while each
// member keeps its own row and status control for granular changes.
function groupRows(rows) {
  const groups = [];
  const byKey = new Map();
  rows.forEach((r) => {
    const key = r.group_id || `solo-${r.id}`;
    if (!byKey.has(key)) {
      const group = { key, groupId: r.group_id, rows: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).rows.push(r);
  });
  return groups;
}

export default function ReservationsTab() {
  const showToast = useToast();
  const [reservations, setReservations] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);

  function load() {
    setReservations(null);
    setError(null);
    apiFetch('/reservations')
      .then(setReservations)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function updateStatus(id, status) {
    try {
      await apiFetch(`/reservations/${id}/status`, { method: 'PATCH', body: { status } });
      setReservations((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
      showToast('Statut mis à jour.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function refuse(id) {
    if (!window.confirm('Refuser cette réservation ?')) return;
    await updateStatus(id, 'refused');
  }

  async function remove(id) {
    if (!window.confirm('Supprimer définitivement cette réservation ?')) return;
    try {
      await apiFetch(`/reservations/${id}`, { method: 'DELETE' });
      setReservations((rows) => rows.filter((r) => r.id !== id));
      showToast('Réservation supprimée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function refuseGroup(groupId) {
    if (!window.confirm('Refuser toutes les personnes de ce rendez-vous groupé ?')) return;
    try {
      await apiFetch(`/reservations/group/${groupId}/status`, { method: 'PATCH', body: { status: 'refused' } });
      setReservations((rows) => rows.map((r) => (r.group_id === groupId ? { ...r, status: 'refused' } : r)));
      showToast('Groupe refusé.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function removeGroup(groupId) {
    if (!window.confirm('Supprimer définitivement toutes les personnes de ce rendez-vous groupé ?')) return;
    try {
      await apiFetch(`/reservations/group/${groupId}`, { method: 'DELETE' });
      setReservations((rows) => rows.filter((r) => r.group_id !== groupId));
      showToast('Groupe supprimé.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const rows = (reservations ?? []).filter((r) => filter === 'all' || r.status === filter);
  const groups = groupRows(rows);

  return (
    <>
      <div className="admin-filters">
        <label htmlFor="status-filter">Filtrer par statut</label>
        <select id="status-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Toutes</option>
          <option value="pending">En attente</option>
          <option value="confirmed">Confirmées</option>
          <option value="completed">Terminées</option>
          <option value="cancelled">Annulées</option>
          <option value="refused">Refusées</option>
        </select>
        {!showAddForm && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAddForm(true)}>
            + Ajouter une réservation
          </button>
        )}
      </div>

      {showAddForm && (
        <AddReservationForm
          onCreated={() => {
            setShowAddForm(false);
            load();
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Créneau</th>
              <th>Prestation</th>
              <th>Client·e</th>
              <th>Contact</th>
              <th>Lieu</th>
              <th>Note</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {error && <tr><td colSpan={9}>Erreur : {error}</td></tr>}
            {!error && reservations === null && <tr><td colSpan={9}>Chargement…</td></tr>}
            {!error && reservations !== null && rows.length === 0 && (
              <tr><td colSpan={9}>Aucune réservation trouvée.</td></tr>
            )}
            {!error && groups.map((group) => (
              <Fragment key={group.key}>
                {group.rows.length > 1 && (
                  <tr className="group-header-row">
                    <td colSpan={9}>
                      <div className="group-header">
                        <span className="group-badge">Rendez-vous groupé · {group.rows.length} personnes</span>
                        <div className="group-actions">
                          <button type="button" onClick={() => refuseGroup(group.groupId)}>Refuser le groupe</button>
                          <button type="button" className="danger" onClick={() => removeGroup(group.groupId)}>Supprimer le groupe</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                {group.rows.map((r) => (
                  <tr key={r.id} className={group.rows.length > 1 ? 'group-member-row' : ''}>
                    <td>{r.reservation_date}</td>
                    <td>{r.start_time} – {r.end_time}</td>
                    <td>{r.service_name}</td>
                    <td>{r.client_name}</td>
                    <td>{r.client_email}<br />{r.client_phone}</td>
                    <td>{r.at_client_home ? <><span className="location-badge">Domicile</span><br />{r.client_address}</> : 'Studio'}</td>
                    <td>{r.notes || '—'}</td>
                    <td>
                      <div className="status-cell">
                        <span className={`status-badge status-${r.status}`}>{STATUS_LABELS[r.status] || r.status}</span>
                        <select className="status-select" value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)}>
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="row-actions">
                      {r.status !== 'refused' && r.status !== 'cancelled' && (
                        <button type="button" onClick={() => refuse(r.id)}>Refuser</button>
                      )}
                      <button type="button" className="danger" onClick={() => remove(r.id)}>Supprimer</button>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
