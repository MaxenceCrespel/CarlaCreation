import { Fragment, useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import ReservationsCalendar from './ReservationsCalendar';

const STATUS_LABELS = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  completed: 'Terminée',
  cancelled: 'Annulée',
  refused: 'Refusée',
};

const EMPTY_GUEST = () => ({ key: Date.now() + Math.random(), name: '', serviceId: '', addonIds: [] });

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

// Same checkbox pattern as the public booking page's AddonCheckboxes, so
// the admin can attach the same optional paid/timed supplements (e.g. nail
// art) when logging a phone/walk-in booking manually.
function AddonCheckboxes({ service, selectedIds, onToggle }) {
  const addons = (service?.addons ?? []).filter((a) => a.active);
  if (addons.length === 0) return null;
  return (
    <div className="addon-checkboxes">
      {addons.map((addon) => (
        <label key={addon.id} className="addon-checkbox">
          <input
            type="checkbox"
            checked={selectedIds.includes(addon.id)}
            onChange={(e) => onToggle(addon.id, e.target.checked)}
          />
          {addon.name}
          <span className="addon-checkbox-meta">
            +{(addon.extra_price_cents / 100).toFixed(2).replace('.', ',')} €
            {addon.extra_duration_minutes > 0 ? ` · +${addon.extra_duration_minutes} min` : ''}
          </span>
        </label>
      ))}
    </div>
  );
}

function AddReservationForm({ onCreated, onCancel }) {
  const showToast = useToast();
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(EMPTY_MANUAL_FORM);
  const [addonIds, setAddonIds] = useState([]);
  const [categories, setCategories] = useState([]);
  const [guests, setGuests] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch('/admin/services').then(setServices).catch(() => showToast('Impossible de charger les prestations.', 'error'));
    apiFetch('/admin/service-categories').then(setCategories).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryName = (id) => categories.find((c) => c.id === id)?.name ?? '';
  const selectedService = services.find((s) => s.id === Number(form.serviceId)) || null;

  function update(field) {
    return (e) => {
      const value = e.target.value;
      setForm((f) => ({ ...f, [field]: value }));
      if (field === 'serviceId') setAddonIds([]);
    };
  }

  function toggleAddon(addonId, checked) {
    setAddonIds((ids) => (checked ? [...ids, addonId] : ids.filter((id) => id !== addonId)));
  }

  function addGuest() {
    setGuests((g) => [...g, EMPTY_GUEST()]);
  }
  function removeGuest(key) {
    setGuests((g) => g.filter((guest) => guest.key !== key));
  }
  function updateGuest(key, patch) {
    setGuests((g) =>
      g.map((guest) => {
        if (guest.key !== key) return guest;
        const next = { ...guest, ...patch };
        if ('serviceId' in patch) next.addonIds = [];
        return next;
      }),
    );
  }
  function toggleGuestAddon(key, addonId, checked) {
    setGuests((g) =>
      g.map((guest) =>
        guest.key === key
          ? { ...guest, addonIds: checked ? [...guest.addonIds, addonId] : guest.addonIds.filter((id) => id !== addonId) }
          : guest,
      ),
    );
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
          addonIds,
          clientAddress: form.atClientHome ? form.clientAddress.trim() : undefined,
          additionalGuests: guests.map((g) => ({ name: g.name.trim(), serviceId: Number(g.serviceId), addonIds: g.addonIds })),
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
              [{categoryName(s.category_id)}] {s.name}
              {!s.active ? ' (inactive)' : ''}
            </option>
          ))}
        </select>
      </div>

      <AddonCheckboxes service={selectedService} selectedIds={addonIds} onToggle={toggleAddon} />

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
                [{categoryName(s.category_id)}] {s.name}
              </option>
            ))}
          </select>
          <AddonCheckboxes
            service={services.find((s) => s.id === Number(guest.serviceId)) || null}
            selectedIds={guest.addonIds}
            onToggle={(addonId, checked) => toggleGuestAddon(guest.key, addonId, checked)}
          />
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

// Edits a single reservation row (service, date/time, client details,
// location, notes) — not the guest list of a group, and not its addons
// (leaving those untouched if this modal doesn't send addonIds at all).
function EditReservationModal({ reservation, onClose, onSaved }) {
  const showToast = useToast();
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    serviceId: reservation.service_id,
    date: reservation.reservation_date,
    startTime: reservation.start_time,
    clientName: reservation.client_name,
    clientEmail: reservation.client_email,
    clientPhone: reservation.client_phone,
    notes: reservation.notes || '',
    atClientHome: reservation.at_client_home,
    clientAddress: reservation.client_address || '',
  });
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/admin/services').then(setServices).catch(() => showToast('Impossible de charger les prestations.', 'error'));
    apiFetch('/admin/service-categories').then(setCategories).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryName = (id) => categories.find((c) => c.id === id)?.name ?? '';

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);

    if (form.atClientHome && !form.clientAddress.trim()) {
      setFeedback('Indiquez une adresse pour un rendez-vous à domicile.');
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/reservations/${reservation.id}`, {
        method: 'PATCH',
        body: {
          serviceId: Number(form.serviceId),
          date: form.date,
          startTime: form.startTime,
          clientName: form.clientName.trim(),
          clientEmail: form.clientEmail.trim(),
          clientPhone: form.clientPhone.trim(),
          notes: form.notes,
          atClientHome: form.atClientHome,
          clientAddress: form.atClientHome ? form.clientAddress.trim() : undefined,
        },
      });
      showToast('Réservation modifiée.', 'success');
      onSaved();
    } catch (err) {
      setFeedback(err.message);
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <form className="modal-card" role="dialog" aria-modal="true" aria-label="Modifier la réservation" noValidate onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
        <h2>Modifier la réservation</h2>
        {reservation.group_id && (
          <p className="loading-text">
            Cette personne fait partie d'un rendez-vous groupé — modifier son créneau ne déplace pas les autres membres du groupe.
          </p>
        )}

        <div className="form-row">
          <label htmlFor="edit-service">Prestation</label>
          <select id="edit-service" required value={form.serviceId} onChange={update('serviceId')}>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                [{categoryName(s.category_id)}] {s.name}
                {!s.active ? ' (inactive)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row two-col">
          <div>
            <label htmlFor="edit-date">Date</label>
            <input type="date" id="edit-date" required value={form.date} onChange={update('date')} />
          </div>
          <div>
            <label htmlFor="edit-time">Heure de début</label>
            <input type="time" id="edit-time" required value={form.startTime} onChange={update('startTime')} />
          </div>
        </div>

        <div className="form-row">
          <label htmlFor="edit-name">Nom</label>
          <input type="text" id="edit-name" required minLength={2} maxLength={100} value={form.clientName} onChange={update('clientName')} />
        </div>

        <div className="form-row two-col">
          <div>
            <label htmlFor="edit-email">Email</label>
            <input type="email" id="edit-email" required value={form.clientEmail} onChange={update('clientEmail')} />
          </div>
          <div>
            <label htmlFor="edit-phone">Téléphone</label>
            <input type="tel" id="edit-phone" required value={form.clientPhone} onChange={update('clientPhone')} />
          </div>
        </div>

        <div className="form-row checkbox-row">
          <label htmlFor="edit-at-home">
            <input
              type="checkbox"
              id="edit-at-home"
              checked={form.atClientHome}
              onChange={(e) => setForm((f) => ({ ...f, atClientHome: e.target.checked }))}
            />
            Rendez-vous à domicile (Carla se déplace)
          </label>
        </div>

        {form.atClientHome && (
          <div className="form-row">
            <label htmlFor="edit-address">Adresse du client·e</label>
            <input type="text" id="edit-address" required minLength={5} maxLength={300} value={form.clientAddress} onChange={update('clientAddress')} />
          </div>
        )}

        <div className="form-row">
          <label htmlFor="edit-notes">Note (optionnel)</label>
          <input type="text" id="edit-notes" maxLength={500} value={form.notes} onChange={update('notes')} />
        </div>

        {feedback && <div className="form-feedback error">{feedback}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
          </button>
        </div>
      </form>
    </div>
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
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'calendar'
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  // { kind: 'single', id } | { kind: 'group', groupId } | null — deletion
  // always goes through this confirmation modal, refuse/status changes don't
  // (deleting is the one destructive, unrecoverable action here).
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // the reservation row being edited, or null

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

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === 'single') {
        await apiFetch(`/reservations/${deleteTarget.id}`, { method: 'DELETE' });
        setReservations((rows) => rows.filter((r) => r.id !== deleteTarget.id));
        showToast('Réservation supprimée.', 'success');
      } else {
        await apiFetch(`/reservations/group/${deleteTarget.groupId}`, { method: 'DELETE' });
        setReservations((rows) => rows.filter((r) => r.group_id !== deleteTarget.groupId));
        showToast('Groupe supprimé.', 'success');
      }
      setDeleteTarget(null);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeleting(false);
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

  const statusFiltered = (reservations ?? []).filter((r) => filter === 'all' || r.status === filter);
  // In calendar mode, the table below only shows the selected day's detail
  // (with the usual actions) — the calendar itself always shows the whole
  // month regardless of a day being picked.
  const rows = viewMode === 'calendar' && selectedCalendarDate
    ? statusFiltered.filter((r) => r.reservation_date === selectedCalendarDate)
    : viewMode === 'calendar'
      ? []
      : statusFiltered;
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

        <div className="view-toggle" role="radiogroup" aria-label="Mode d'affichage">
          <button type="button" role="radio" aria-checked={viewMode === 'list'} className={`view-toggle-btn ${viewMode === 'list' ? 'is-active' : ''}`} onClick={() => setViewMode('list')}>
            Liste
          </button>
          <button type="button" role="radio" aria-checked={viewMode === 'calendar'} className={`view-toggle-btn ${viewMode === 'calendar' ? 'is-active' : ''}`} onClick={() => setViewMode('calendar')}>
            Calendrier
          </button>
        </div>

        {!showAddForm && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAddForm(true)}>
            + Ajouter une réservation
          </button>
        )}
      </div>

      {viewMode === 'calendar' && (
        <ReservationsCalendar reservations={statusFiltered} selectedDate={selectedCalendarDate} onSelectDate={setSelectedCalendarDate} />
      )}

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
              <tr>
                <td colSpan={9}>
                  {viewMode === 'calendar' && !selectedCalendarDate
                    ? 'Cliquez sur une date du calendrier pour voir le détail.'
                    : 'Aucune réservation trouvée.'}
                </td>
              </tr>
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
                          <button type="button" className="danger" onClick={() => setDeleteTarget({ kind: 'group', groupId: group.groupId, count: group.rows.length })}>Supprimer le groupe</button>
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
                      <button type="button" onClick={() => setEditTarget(r)}>Modifier</button>
                      {r.status !== 'refused' && r.status !== 'cancelled' && (
                        <button type="button" onClick={() => refuse(r.id)}>Refuser</button>
                      )}
                      <button
                        type="button"
                        className="danger"
                        onClick={() => setDeleteTarget({ kind: 'single', id: r.id, clientName: r.client_name, willNotify: r.status === 'pending' || r.status === 'confirmed' })}
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-label="Confirmer la suppression" onClick={(e) => e.stopPropagation()}>
            <h2>Confirmer la suppression</h2>
            {deleteTarget.kind === 'single' ? (
              <p>
                Supprimer définitivement la réservation de <strong>{deleteTarget.clientName}</strong> ?
                {deleteTarget.willNotify && " Le client recevra un email l'informant de l'annulation."}
              </p>
            ) : (
              <p>
                Supprimer définitivement les {deleteTarget.count} personnes de ce rendez-vous groupé ?
                Le client recevra un email l'informant de l'annulation si le rendez-vous est en attente ou confirmé.
              </p>
            )}
            <p className="loading-text">Cette action est irréversible.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Annuler
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <EditReservationModal
          reservation={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            load();
          }}
        />
      )}
    </>
  );
}
