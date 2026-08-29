import { Fragment, useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import ReservationsCalendar from './ReservationsCalendar';
import { formatPrice } from '../../utils/format';

// Service price + addons, minus any promotion discount — the actual total
// the client is paying for this reservation (travel fee shown separately
// elsewhere, since it depends on distance and isn't part of the "formule").
function reservationTotalCents(r) {
  const addonsSum = (r.addons ?? []).reduce((sum, a) => sum + a.extra_price_cents, 0);
  const fullPrice = r.price_cents + addonsSum;
  return Math.round(fullPrice * (1 - (r.discount_percent ?? 0) / 100));
}

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
  allowOverlap: false,
  promotionId: '',
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

// Suggests names from past reservations (fiche client or not) while the
// admin types in the manual-booking form — picking one prefills email/phone
// too, so a returning client's second visit doesn't need retyping everything.
function ClientNameAutocomplete({ id, value, onChange, onPick }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [debouncedName, setDebouncedName] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedName(value.trim()), 300);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    if (debouncedName.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    let cancelled = false;
    apiFetch(`/admin/clients/suggest?q=${encodeURIComponent(debouncedName)}`)
      .then((rows) => {
        if (!cancelled) setSuggestions(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [debouncedName]);

  return (
    <div className="client-autocomplete">
      <input
        type="text"
        id={id}
        required
        minLength={2}
        maxLength={100}
        autoComplete="off"
        value={value}
        onChange={onChange}
        onFocus={() => setOpen(true)}
        // Delayed so a click on a suggestion registers before the list unmounts.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 && (
        <ul className="client-autocomplete-list">
          {suggestions.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => {
                  onPick(s);
                  setOpen(false);
                }}
              >
                <span className="client-autocomplete-name">{s.name}</span>
                {(s.phone || s.email) && (
                  <span className="client-autocomplete-meta">{[s.phone, s.email].filter(Boolean).join(' · ')}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
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
  const [promotions, setPromotions] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch('/admin/services').then(setServices).catch(() => showToast('Impossible de charger les prestations.', 'error'));
    apiFetch('/admin/service-categories').then(setCategories).catch(() => {});
    apiFetch('/admin/promotions').then(setPromotions).catch(() => {});
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

  function pickSuggestedClient(suggestion) {
    setForm((f) => ({
      ...f,
      clientName: suggestion.name,
      clientEmail: suggestion.email || f.clientEmail,
      clientPhone: suggestion.phone || f.clientPhone,
    }));
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
          promotionId: form.promotionId ? Number(form.promotionId) : undefined,
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
        <ClientNameAutocomplete id="manual-name" value={form.clientName} onChange={update('clientName')} onPick={pickSuggestedClient} />
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

      <div className="form-row checkbox-row">
        <label htmlFor="manual-allow-overlap">
          <input
            type="checkbox"
            id="manual-allow-overlap"
            checked={form.allowOverlap}
            onChange={(e) => setForm((f) => ({ ...f, allowOverlap: e.target.checked }))}
          />
          Autoriser le chevauchement avec un autre rendez-vous
        </label>
        <p className="form-hint">
          Utile par exemple pour caser une coupe pendant le temps de pose d'une couleur.
        </p>
      </div>

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

      {promotions.length > 0 && (
        <div className="form-row">
          <label htmlFor="manual-promotion">Promotion (optionnel)</label>
          <select id="manual-promotion" value={form.promotionId} onChange={update('promotionId')}>
            <option value="">Aucune</option>
            {promotions.filter((p) => p.active).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} (-{p.discount_percent}%){p.requires_code ? ` — code ${p.code}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

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
    allowOverlap: false,
    promotionId: reservation.promotion_id ? String(reservation.promotion_id) : '',
  });
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const [promotions, setPromotions] = useState([]);

  // reservation_addons only stores a name/price/duration snapshot, not an
  // addon id (see updateReservation on the API side) — so on open, we
  // best-effort match the current service's addons by NAME to pre-check
  // the right boxes. If nothing changed, addonIds stays untouched
  // (addonsDirty false) and is omitted from the PATCH entirely, so a
  // rename that breaks the name match can never silently drop a supplement
  // just by saving an unrelated field.
  const [addonIds, setAddonIds] = useState([]);
  const [addonsDirty, setAddonsDirty] = useState(false);
  const [addonsInitialized, setAddonsInitialized] = useState(false);

  useEffect(() => {
    apiFetch('/admin/services').then(setServices).catch(() => showToast('Impossible de charger les prestations.', 'error'));
    apiFetch('/admin/service-categories').then(setCategories).catch(() => {});
    apiFetch('/admin/promotions').then(setPromotions).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (addonsInitialized || services.length === 0) return;
    const currentService = services.find((s) => s.id === reservation.service_id);
    const existingNames = new Set((reservation.addons ?? []).map((a) => a.name));
    const matched = (currentService?.addons ?? []).filter((a) => existingNames.has(a.name)).map((a) => a.id);
    setAddonIds(matched);
    setAddonsInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, addonsInitialized]);

  const categoryName = (id) => categories.find((c) => c.id === id)?.name ?? '';
  const selectedService = services.find((s) => s.id === Number(form.serviceId)) || null;

  function update(field) {
    return (e) => {
      const value = e.target.value;
      setForm((f) => ({ ...f, [field]: value }));
      if (field === 'serviceId') {
        setAddonIds([]);
        setAddonsDirty(true);
      }
    };
  }

  function toggleAddon(addonId, checked) {
    setAddonIds((ids) => (checked ? [...ids, addonId] : ids.filter((id) => id !== addonId)));
    setAddonsDirty(true);
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
          addonIds: addonsDirty ? addonIds : undefined,
          allowOverlap: form.allowOverlap,
          promotionId: form.promotionId ? Number(form.promotionId) : null,
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

        <AddonCheckboxes service={selectedService} selectedIds={addonIds} onToggle={toggleAddon} />

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

        {promotions.length > 0 && (
          <div className="form-row">
            <label htmlFor="edit-promotion">Promotion (optionnel)</label>
            <select id="edit-promotion" value={form.promotionId} onChange={update('promotionId')}>
              <option value="">Aucune</option>
              {promotions.filter((p) => p.active || String(p.id) === form.promotionId).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} (-{p.discount_percent}%){p.requires_code ? ` — code ${p.code}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="form-row checkbox-row">
          <label htmlFor="edit-allow-overlap">
            <input
              type="checkbox"
              id="edit-allow-overlap"
              checked={form.allowOverlap}
              onChange={(e) => setForm((f) => ({ ...f, allowOverlap: e.target.checked }))}
            />
            Autoriser le chevauchement avec un autre rendez-vous
          </label>
          <p className="form-hint">
            À cocher si ce créneau chevauche volontairement un autre rendez-vous (ex : temps de pose d'une couleur).
          </p>
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

// Proposes existing "fiche client" profiles matching this reservation's
// name (normalized match only — never auto-linked, see ClientsService).
// The admin always makes the final call, since two different people can
// share a name (e.g. a mother booking for herself, then later her child).
function ClientMatchModal({ reservation, onClose, onLinked }) {
  const showToast = useToast();
  const [candidates, setCandidates] = useState(null);
  const [error, setError] = useState(null);
  const [linkingId, setLinkingId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: reservation.client_name,
    phone: reservation.client_phone || '',
    email: reservation.client_email || '',
    notes: '',
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiFetch(`/admin/clients/match?name=${encodeURIComponent(reservation.client_name)}`)
      .then((rows) => {
        setCandidates(rows);
        setShowCreateForm(rows.length === 0);
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function linkTo(clientId) {
    setLinkingId(clientId);
    try {
      await apiFetch('/admin/clients/link', { method: 'POST', body: { reservationId: reservation.id, clientId } });
      onLinked(reservation.id, clientId);
      showToast('Fiche client liée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLinkingId(null);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      const client = await apiFetch('/admin/clients/create-and-link', {
        method: 'POST',
        body: { reservationId: reservation.id, ...createForm },
      });
      onLinked(reservation.id, client.id);
      showToast('Fiche client créée et liée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Fiche client" onClick={(e) => e.stopPropagation()}>
        <h2>Fiche client</h2>
        <p className="form-hint">
          Rendez-vous actuel — {reservation.client_name} · {reservation.client_phone || '—'} · {reservation.client_email || '—'} · {reservation.service_name}
        </p>

        {error && <p className="form-feedback error">{error}</p>}
        {!error && candidates === null && <p className="loading-text">Recherche de fiches existantes…</p>}

        {!error && candidates !== null && candidates.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <label>Fiches existantes correspondant à ce nom</label>
            {candidates.map((c) => (
              <div key={c.id} className="card" style={{ marginTop: 8, marginBottom: 0 }}>
                <strong>{c.name}</strong>
                <div className="row-addons">{c.phone || '—'} · {c.email || '—'}</div>
                {c.notes && <div className="row-addons">Note : {c.notes}</div>}
                {c.history.length > 0 ? (
                  <div className="row-addons">
                    Historique : {c.history.map((h) => `${h.service_name} (${h.reservation_date})`).join(', ')}
                  </div>
                ) : (
                  <div className="row-addons">Aucun rendez-vous précédent enregistré sur cette fiche.</div>
                )}
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ marginTop: 8 }}
                  disabled={linkingId === c.id}
                  onClick={() => linkTo(c.id)}
                >
                  {linkingId === c.id ? 'Liaison…' : 'Lier à cette fiche'}
                </button>
              </div>
            ))}
          </div>
        )}

        {!error && candidates !== null && !showCreateForm && (
          <button type="button" className="btn btn-outline" style={{ marginTop: 16 }} onClick={() => setShowCreateForm(true)}>
            + Créer une nouvelle fiche
          </button>
        )}

        {!error && candidates !== null && showCreateForm && (
          <form onSubmit={handleCreate} style={{ marginTop: 16 }}>
            <label>Nouvelle fiche client</label>
            <div className="form-row two-col">
              <div>
                <label htmlFor="client-create-name">Nom</label>
                <input
                  type="text"
                  id="client-create-name"
                  required
                  maxLength={200}
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="client-create-phone">Téléphone</label>
                <input
                  type="text"
                  id="client-create-phone"
                  maxLength={50}
                  value={createForm.phone}
                  onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="client-create-email">Email</label>
              <input
                type="email"
                id="client-create-email"
                maxLength={200}
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="form-row">
              <label htmlFor="client-create-notes">Note (optionnel)</label>
              <input
                type="text"
                id="client-create-notes"
                maxLength={500}
                value={createForm.notes}
                onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="modal-actions">
              {candidates.length > 0 && (
                <button type="button" className="btn btn-outline" onClick={() => setShowCreateForm(false)} disabled={creating}>
                  Annuler
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Création…' : 'Créer et lier'}
              </button>
            </div>
          </form>
        )}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

// Phone-width stand-in for the desktop table row: the mobile list only
// shows a compact summary (heure, client, prestation, statut) — tapping it
// opens this modal with everything the table row normally shows inline
// (contact, lieu, note, statut modifiable, actions). Delegates every
// mutation back to the parent's existing handlers so there's no duplicated
// business logic, only a different presentation of the same row.
function ReservationDetailModal({ reservation: r, onClose, onUpdateStatus, onEdit, onRefuse, onDelete, onLinkClient, onUnlinkClient }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Détail de la réservation" onClick={(e) => e.stopPropagation()}>
        <h2>{r.client_name}</h2>

        <dl className="recap-list">
          <div>
            <dt>Date</dt>
            <dd>{formatDayHeading(r.reservation_date)} · {r.start_time} – {r.end_time}</dd>
          </div>
          <div>
            <dt>Prestation</dt>
            <dd>
              {r.service_name} — {formatPrice(r.price_cents)}
              {r.addons && r.addons.length > 0 && (
                <div className="row-addons">+ {r.addons.map((a) => `${a.name} (${formatPrice(a.extra_price_cents)})`).join(', ')}</div>
              )}
              {r.discount_percent > 0 ? (
                <div className="row-addons">
                  -{r.discount_percent}% {r.promotion_label ? `(${r.promotion_label})` : '(code promo)'} → total {formatPrice(reservationTotalCents(r))}
                </div>
              ) : (
                <div className="row-addons">Total : {formatPrice(reservationTotalCents(r))}</div>
              )}
            </dd>
          </div>
          <div>
            <dt>Fiche client</dt>
            <dd>
              {r.client_id ? (
                <>
                  <span className="status-badge status-confirmed">Fiche liée</span>{' '}
                  <button type="button" className="link-btn" onClick={() => onUnlinkClient(r.id)}>Délier</button>
                </>
              ) : (
                <button type="button" className="link-btn" onClick={() => onLinkClient(r)}>+ Fiche client</button>
              )}
            </dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd>{r.client_email}<br />{r.client_phone}</dd>
          </div>
          <div>
            <dt>Lieu</dt>
            <dd>
              {r.at_client_home ? (
                <>
                  <span className="location-badge">Domicile</span><br />
                  {r.client_address}
                  <div className="location-links">
                    <a href={mapsUrl(r.client_address)} target="_blank" rel="noopener noreferrer">Maps</a>
                    {' · '}
                    <a href={wazeUrl(r.client_address)} target="_blank" rel="noopener noreferrer">Waze</a>
                  </div>
                  {r.travel_distance_km != null && (
                    <div className="location-travel">
                      ≈ {r.travel_distance_km} km · {r.travel_duration_minutes} min
                      {r.travel_fee_cents != null && ` · ${(r.travel_fee_cents / 100).toFixed(2).replace('.', ',')} €`}
                    </div>
                  )}
                </>
              ) : (
                'Studio'
              )}
            </dd>
          </div>
          {r.notes && (
            <div>
              <dt>Note</dt>
              <dd>{r.notes}</dd>
            </div>
          )}
          <div>
            <dt>Statut</dt>
            <dd className="status-cell">
              <span className={`status-badge status-${r.status}`}>{STATUS_LABELS[r.status] || r.status}</span>
              <select className="status-select" value={r.status} onChange={(e) => onUpdateStatus(r.id, e.target.value)}>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </dd>
          </div>
        </dl>

        <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline" onClick={() => onEdit(r)}>Modifier</button>
          {r.status !== 'refused' && r.status !== 'cancelled' && (
            <button type="button" className="btn btn-outline" onClick={() => onRefuse(r.id)}>Refuser</button>
          )}
          <button type="button" className="btn btn-outline-danger" onClick={() => onDelete(r)}>Supprimer</button>
        </div>

        <div className="modal-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>Fermer</button>
        </div>
      </div>
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

// One section per day (rows already sorted by date/time from the API) —
// makes a long list scannable at a glance instead of a wall of identical-
// looking rows the admin has to read date-by-date to tell apart.
function groupByDay(rows) {
  const days = [];
  const byDate = new Map();
  rows.forEach((r) => {
    if (!byDate.has(r.reservation_date)) {
      const day = { date: r.reservation_date, rows: [] };
      byDate.set(r.reservation_date, day);
      days.push(day);
    }
    byDate.get(r.reservation_date).rows.push(r);
  });
  return days;
}

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
function formatDayHeading(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAY_NAMES[date.getDay()]} ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

function mapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
function wazeUrl(address) {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

export default function ReservationsTab() {
  const showToast = useToast();
  const [reservations, setReservations] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('confirmed');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'calendar'
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  // { kind: 'single', id } | { kind: 'group', groupId } | null — deletion
  // always goes through this confirmation modal, refuse/status changes don't
  // (deleting is the one destructive, unrecoverable action here).
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // the reservation row being edited, or null
  const [clientModalTarget, setClientModalTarget] = useState(null); // the reservation row being matched to a "fiche client", or null
  const [detailTarget, setDetailTarget] = useState(null); // the reservation row shown in the mobile detail modal, or null

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

  function handleClientLinked(reservationId, clientId) {
    setReservations((rows) => rows.map((r) => (r.id === reservationId ? { ...r, client_id: clientId } : r)));
    setClientModalTarget(null);
  }

  async function unlinkClient(id) {
    if (!window.confirm('Délier cette fiche client de ce rendez-vous ?')) return;
    try {
      await apiFetch('/admin/clients/unlink', { method: 'POST', body: { reservationId: id } });
      setReservations((rows) => rows.map((r) => (r.id === id ? { ...r, client_id: null } : r)));
      showToast('Fiche déliée.', 'success');
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

  const statusFiltered = (reservations ?? []).filter((r) => filter === 'all' || r.status === filter);
  const searchNeedle = search.trim().toLowerCase();
  // A phone number is matched digit-by-digit (ignoring spaces/dashes) in
  // addition to the plain substring check above — an admin typing the
  // number as read out on a call ("06 15 22 33 44") shouldn't fail to match
  // a reservation whose phone was saved without spaces, or vice versa.
  const digitsNeedle = search.replace(/\D/g, '');
  const searchFiltered = searchNeedle
    ? statusFiltered.filter((r) => {
        const textMatch = [r.client_name, r.client_email, r.client_phone, r.notes, r.service_name, r.client_address]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(searchNeedle));
        const phoneMatch = digitsNeedle.length >= 3 && (r.client_phone || '').replace(/\D/g, '').includes(digitsNeedle);
        return textMatch || phoneMatch;
      })
    : statusFiltered;
  const dateFiltered = dateFilter ? searchFiltered.filter((r) => r.reservation_date === dateFilter) : searchFiltered;
  // In calendar mode, the table below only shows the selected day's detail
  // (with the usual actions) — the calendar itself always shows the whole
  // month regardless of a day being picked.
  const rows = viewMode === 'calendar' && selectedCalendarDate
    ? dateFiltered.filter((r) => r.reservation_date === selectedCalendarDate)
    : viewMode === 'calendar'
      ? []
      : dateFiltered;
  const days = viewMode === 'calendar' ? [{ date: null, rows }] : groupByDay(rows);

  return (
    <>
      <div className="admin-filters">
        <label htmlFor="reservation-search">Rechercher</label>
        <input
          type="search"
          id="reservation-search"
          placeholder="Nom, email, téléphone, note…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <label htmlFor="date-filter">Filtrer par date</label>
        <input type="date" id="date-filter" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />

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

      {/* Phone-width stand-in for the table below — one compact row per
          reservation, tap to open the full detail in a modal. Both are
          always rendered; a CSS breakpoint shows only one at a time (see
          .reservations-mobile-list / .table-wrap in main.css). */}
      <div className="reservations-mobile-list">
        {error && <p className="loading-text">Erreur : {error}</p>}
        {!error && reservations === null && <p className="loading-text">Chargement…</p>}
        {!error && reservations !== null && rows.length === 0 && (
          <p className="loading-text">
            {viewMode === 'calendar' && !selectedCalendarDate
              ? 'Touchez une date du calendrier pour voir le détail.'
              : 'Aucune réservation trouvée.'}
          </p>
        )}
        {!error && days.map((day) => (
          <Fragment key={day.date ?? 'calendar-mobile'}>
            {day.date && (
              <div className="mobile-day-heading">{formatDayHeading(day.date)} · {day.rows.length} réservation{day.rows.length > 1 ? 's' : ''}</div>
            )}
            {groupRows(day.rows).map((group) => (
              <Fragment key={group.key}>
                {group.rows.length > 1 && (
                  <div className="mobile-group-badge">Rendez-vous groupé · {group.rows.length} personnes</div>
                )}
                {group.rows.map((r) => (
                  <button type="button" key={r.id} className="reservation-summary-row" onClick={() => setDetailTarget(r)}>
                    <span className="reservation-summary-time">{r.start_time}</span>
                    <span className="reservation-summary-main">
                      <span className="reservation-summary-name">{r.client_name}</span>
                      <span className="reservation-summary-service">{r.service_name}</span>
                    </span>
                    <span className={`status-badge status-${r.status}`}>{STATUS_LABELS[r.status] || r.status}</span>
                  </button>
                ))}
              </Fragment>
            ))}
          </Fragment>
        ))}
      </div>

      <div className="table-wrap reservations-table-wrap">
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
            {!error && days.map((day) => (
              <Fragment key={day.date ?? 'calendar'}>
                {day.date && (
                  <tr className="day-header-row">
                    <td colSpan={9}>{formatDayHeading(day.date)} · {day.rows.length} réservation{day.rows.length > 1 ? 's' : ''}</td>
                  </tr>
                )}
                {groupRows(day.rows).map((group) => (
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
                        <td>
                          {r.service_name} — {formatPrice(r.price_cents)}
                          {r.addons && r.addons.length > 0 && (
                            <div className="row-addons">+ {r.addons.map((a) => `${a.name} (${formatPrice(a.extra_price_cents)})`).join(', ')}</div>
                          )}
                          {r.discount_percent > 0 ? (
                            <div className="row-addons">
                              -{r.discount_percent}% {r.promotion_label ? `(${r.promotion_label})` : '(code promo)'} → {formatPrice(reservationTotalCents(r))}
                            </div>
                          ) : (
                            <div className="row-addons">Total : {formatPrice(reservationTotalCents(r))}</div>
                          )}
                        </td>
                        <td>
                          {r.client_name}
                          <div className="row-addons">
                            {r.client_id ? (
                              <>
                                <span className="status-badge status-confirmed">Fiche liée</span>{' '}
                                <button type="button" className="link-btn" onClick={() => unlinkClient(r.id)}>Délier</button>
                              </>
                            ) : (
                              <button type="button" className="link-btn" onClick={() => setClientModalTarget(r)}>+ Fiche client</button>
                            )}
                          </div>
                        </td>
                        <td>{r.client_email}<br />{r.client_phone}</td>
                        <td>
                          {r.at_client_home ? (
                            <>
                              <span className="location-badge">Domicile</span><br />
                              {r.client_address}
                              <div className="location-links">
                                <a href={mapsUrl(r.client_address)} target="_blank" rel="noopener noreferrer">Maps</a>
                                {' · '}
                                <a href={wazeUrl(r.client_address)} target="_blank" rel="noopener noreferrer">Waze</a>
                              </div>
                              {r.travel_distance_km != null && (
                                <div className="location-travel">
                                  ≈ {r.travel_distance_km} km · {r.travel_duration_minutes} min
                                  {r.travel_fee_cents != null && ` · ${(r.travel_fee_cents / 100).toFixed(2).replace('.', ',')} €`}
                                </div>
                              )}
                            </>
                          ) : (
                            'Studio'
                          )}
                        </td>
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

      {clientModalTarget && (
        <ClientMatchModal
          reservation={clientModalTarget}
          onClose={() => setClientModalTarget(null)}
          onLinked={handleClientLinked}
        />
      )}

      {detailTarget && (
        <ReservationDetailModal
          reservation={detailTarget}
          onClose={() => setDetailTarget(null)}
          onUpdateStatus={(id, status) => {
            updateStatus(id, status);
            setDetailTarget((t) => (t ? { ...t, status } : t));
          }}
          onEdit={(r) => {
            setDetailTarget(null);
            setEditTarget(r);
          }}
          onRefuse={(id) => {
            refuse(id);
            setDetailTarget(null);
          }}
          onDelete={(r) => {
            setDetailTarget(null);
            setDeleteTarget({ kind: 'single', id: r.id, clientName: r.client_name, willNotify: r.status === 'pending' || r.status === 'confirmed' });
          }}
          onLinkClient={(r) => {
            setDetailTarget(null);
            setClientModalTarget(r);
          }}
          onUnlinkClient={(id) => {
            unlinkClient(id);
            setDetailTarget(null);
          }}
        />
      )}
    </>
  );
}
