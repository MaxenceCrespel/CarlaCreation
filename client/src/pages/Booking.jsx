import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useSiteConfig } from '../context/SiteConfigContext';
import { useToast } from '../context/ToastContext';
import { useSeo } from '../hooks/useSeo';
import { formatDuration, formatPrice } from '../utils/format';
import { getSavedContact, saveContact } from '../utils/contactStorage';

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const CATEGORIES = [
  { key: 'coiffure', label: 'Coiffure' },
  { key: 'ongles', label: 'Ongles' },
];
const HOURS_PREVIEW_DAYS = 14;
const DAY_PICKER_DAYS = 30;
const MAX_ADDITIONAL_GUESTS = 5;

// 'YYYY-MM-DD' in the visitor's own local time — not toISOString() (always
// UTC), which would show yesterday's date for the first couple hours after
// midnight local time.
function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function todayISO() {
  return localDateString(new Date());
}
function maxDateISO() {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return localDateString(d);
}
function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
function dayOfWeekFor(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

// Optional extras for the currently selected service (e.g. "Nail Art" on a
// manicure) — only rendered when that service actually has any.
function AddonCheckboxes({ service, selectedIds, onToggle }) {
  if (!service || !service.addons || service.addons.length === 0) return null;

  return (
    <div className="addon-checkboxes">
      <span className="addon-checkboxes-label">Suppléments (optionnel)</span>
      {service.addons.map((addon) => (
        <label key={addon.id} className="addon-checkbox">
          <input
            type="checkbox"
            checked={selectedIds.includes(addon.id)}
            onChange={(e) => onToggle(addon.id, e.target.checked)}
          />
          <span>{addon.name}</span>
          <span className="addon-checkbox-meta">
            +{formatPrice(addon.extra_price_cents)}{addon.extra_duration_minutes > 0 ? ` · +${addon.extra_duration_minutes} min` : ''}
          </span>
        </label>
      ))}
    </div>
  );
}

// Category tabs + clickable service cards, shared by the primary booker and
// each additional guest so picking a service always looks the same.
function ServicePicker({ services, category, onCategoryChange, selectedServiceId, onSelectService }) {
  const inCategory = useMemo(() => services.filter((s) => s.category === category), [services, category]);

  return (
    <>
      <div className="category-tabs" role="tablist" aria-label="Choisir une catégorie">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={category === c.key}
            className={`category-tab ${category === c.key ? 'is-active' : ''}`}
            onClick={() => onCategoryChange(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="service-pick-grid">
        {inCategory.length === 0 && <p className="loading-text">Chargement des prestations…</p>}
        {inCategory.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`service-pick-card ${selectedServiceId === s.id ? 'is-selected' : ''}`}
            onClick={() => onSelectService(s.id)}
          >
            <h4>{s.name}</h4>
            <div className="service-meta">
              <span className="service-price">{formatPrice(s.price_cents)}</span>
              <span className="service-duration">{formatDuration(s.duration_minutes)}</span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

let guestKeySeq = 0;

export default function Booking() {
  const { sitePhone, sitePhoneHref } = useSiteConfig();
  useSeo({
    title: 'Réserver un rendez-vous à Lille',
    description:
      'Réservez votre rendez-vous coiffure ou ongles en ligne à Lille (Hauts-de-France), 24h/24, en quelques clics.',
    path: '/booking',
  });
  const showToast = useToast();

  const [services, setServices] = useState([]);
  const [category, setCategory] = useState('coiffure');
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState([]);

  // Additional people booked in the same visit (e.g. a mother booking for
  // herself and her daughter): each has their own name, category, service
  // and, if that service has any, selected addons.
  const [guests, setGuests] = useState([]);

  // Carla is a solo auto-entrepreneuse: the client either comes to her
  // (default) or she travels to the client's address instead.
  const [atClientHome, setAtClientHome] = useState(false);

  const [date, setDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [slotsState, setSlotsState] = useState('idle'); // idle | loading | ready | empty | error
  const [selectedSlot, setSelectedSlot] = useState('');
  const [hours, setHours] = useState([]);
  const [nextAvailable, setNextAvailable] = useState(null); // null | 'loading' | 'none' | { date, startTime }

  // Pre-fill from a previous visit so returning clients don't have to
  // retype their details every time; only saved locally in the browser.
  const [form, setForm] = useState(() => ({
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    clientAddress: '',
    notes: '',
    website: '',
    ...getSavedContact(),
  }));
  const [feedback, setFeedback] = useState(null);
  const [manageGroupId, setManageGroupId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showRecap, setShowRecap] = useState(false);

  const dateSectionRef = useRef(null);

  useEffect(() => {
    apiFetch('/services').then(setServices).catch(() => showToast('Impossible de charger les prestations.', 'error'));
    apiFetch('/hours')
      .then((data) => setHours(data.days))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedService = services.find((s) => s.id === selectedServiceId) || null;
  const allGuestsHaveService = guests.every((g) => g.serviceId);
  const serviceIds = useMemo(
    () => (selectedServiceId ? [selectedServiceId, ...guests.map((g) => g.serviceId).filter(Boolean)] : []),
    [selectedServiceId, guests],
  );

  const allSelectedAddons = useMemo(() => {
    const primaryAddons = selectedService?.addons?.filter((a) => selectedAddonIds.includes(a.id)) ?? [];
    const guestAddons = guests.flatMap((g) => services.find((s) => s.id === g.serviceId)?.addons?.filter((a) => g.addonIds.includes(a.id)) ?? []);
    return [...primaryAddons, ...guestAddons];
  }, [selectedService, selectedAddonIds, guests, services]);
  const totalAddonMinutes = useMemo(() => allSelectedAddons.reduce((sum, a) => sum + a.extra_duration_minutes, 0), [allSelectedAddons]);
  const totalAddonPrice = useMemo(() => allSelectedAddons.reduce((sum, a) => sum + a.extra_price_cents, 0), [allSelectedAddons]);

  const totalDuration = useMemo(
    () => serviceIds.reduce((sum, id) => sum + (services.find((s) => s.id === id)?.duration_minutes ?? 0), 0) + totalAddonMinutes,
    [serviceIds, services, totalAddonMinutes],
  );
  const totalPrice = useMemo(
    () => serviceIds.reduce((sum, id) => sum + (services.find((s) => s.id === id)?.price_cents ?? 0), 0) + totalAddonPrice,
    [serviceIds, services, totalAddonPrice],
  );
  const recapGuests = useMemo(
    () => [
      { name: form.clientName, service: selectedService, addons: selectedService?.addons?.filter((a) => selectedAddonIds.includes(a.id)) ?? [] },
      ...guests.map((g) => {
        const svc = services.find((s) => s.id === g.serviceId) || null;
        return { name: g.name, service: svc, addons: svc?.addons?.filter((a) => g.addonIds.includes(a.id)) ?? [] };
      }),
    ],
    [form.clientName, selectedService, selectedAddonIds, guests, services],
  );

  function pickCategory(key) {
    setCategory(key);
    setSelectedServiceId(null);
    setSelectedAddonIds([]);
    setSlots([]);
    setSlotsState('idle');
    setSelectedSlot('');
  }

  function toggleAddon(addonId, checked) {
    setSelectedAddonIds((ids) => (checked ? [...ids, addonId] : ids.filter((id) => id !== addonId)));
    setSlots([]);
    setSlotsState('idle');
    setSelectedSlot('');
  }

  function toggleGuestAddon(key, addonId, checked) {
    setGuests((g) =>
      g.map((guest) =>
        guest.key === key
          ? { ...guest, addonIds: checked ? [...guest.addonIds, addonId] : guest.addonIds.filter((id) => id !== addonId) }
          : guest,
      ),
    );
    setSlots([]);
    setSlotsState('idle');
    setSelectedSlot('');
  }

  function pickLocation(home) {
    setAtClientHome(home);
    setSlots([]);
    setSlotsState('idle');
    setSelectedSlot('');
  }

  function pickService(id) {
    setSelectedServiceId(id);
    setSelectedAddonIds([]);
    setSlots([]);
    setSlotsState('idle');
    setSelectedSlot('');
    // Once a prestation is picked, bring the rest of the form (date, slot,
    // contact info) into view instead of leaving the client to scroll
    // themselves — especially useful on mobile where the picker is tall.
    requestAnimationFrame(() => {
      dateSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function addGuest() {
    if (guests.length >= MAX_ADDITIONAL_GUESTS) return;
    guestKeySeq += 1;
    setGuests((g) => [...g, { key: guestKeySeq, name: '', category: 'coiffure', serviceId: null, addonIds: [] }]);
    setSlots([]);
    setSlotsState('idle');
    setSelectedSlot('');
  }

  function removeGuest(key) {
    setGuests((g) => g.filter((guest) => guest.key !== key));
    setSlots([]);
    setSlotsState('idle');
    setSelectedSlot('');
  }

  // Changing category/service resets that guest's addons — an addon only
  // makes sense for the specific service it's attached to.
  function updateGuest(key, patch) {
    setGuests((g) => g.map((guest) => (guest.key === key ? { ...guest, ...patch, addonIds: [] } : guest)));
    setSlots([]);
    setSlotsState('idle');
    setSelectedSlot('');
  }

  // Suggests the earliest date+time the client could actually get, computed
  // server-side, as soon as the prestation(s) are chosen — before the client
  // has to manually browse the day picker themselves.
  useEffect(() => {
    if (!selectedServiceId || !allGuestsHaveService) {
      setNextAvailable(null);
      return;
    }
    let cancelled = false;
    setNextAvailable('loading');
    apiFetch(`/reservations/next-available?serviceIds=${serviceIds.join(',')}&atClientHome=${atClientHome}&addonMinutes=${totalAddonMinutes}`)
      .then((result) => {
        if (cancelled) return;
        setNextAvailable(result || 'none');
      })
      .catch(() => {
        if (!cancelled) setNextAvailable(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceIds.join(','), allGuestsHaveService, atClientHome, totalAddonMinutes]);

  function applySuggestion(suggestion) {
    setDate(suggestion.date);
  }

  useEffect(() => {
    if (!date || !selectedServiceId || !allGuestsHaveService) {
      setSlots([]);
      setSlotsState('idle');
      return;
    }
    let cancelled = false;
    setSlotsState('loading');
    apiFetch(`/reservations/availability?date=${encodeURIComponent(date)}&serviceIds=${serviceIds.join(',')}&atClientHome=${atClientHome}&addonMinutes=${totalAddonMinutes}`)
      .then((result) => {
        if (cancelled) return;
        setSlots(result.slots);
        setSlotsState(result.slots.length ? 'ready' : 'empty');
        // Auto-suggest the earliest slot of the chosen day so most clients
        // can just confirm instead of opening the dropdown themselves.
        setSelectedSlot(result.slots[0] || '');
      })
      .catch(() => {
        if (!cancelled) setSlotsState('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, serviceIds.join(','), allGuestsHaveService, atClientHome, totalAddonMinutes]);

  useEffect(() => {
    if (!showRecap) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !submitting) setShowRecap(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showRecap, submitting]);

  function updateField(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  // Validates the form and, if everything checks out, opens the recap
  // modal instead of submitting immediately — the actual API call happens
  // in confirmBooking, once the client has reviewed and confirmed it.
  function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);
    setManageGroupId(null);

    if (!selectedServiceId || !date || !selectedSlot) {
      setFeedback({ type: 'error', text: 'Choisissez une prestation, une date et un créneau.' });
      return;
    }
    if (guests.some((g) => !g.name.trim() || !g.serviceId)) {
      setFeedback({ type: 'error', text: 'Complétez le nom et la prestation de chaque personne ajoutée, ou retirez-la.' });
      return;
    }
    if (atClientHome && !form.clientAddress.trim()) {
      setFeedback({ type: 'error', text: 'Indiquez votre adresse pour un rendez-vous à domicile.' });
      return;
    }
    if (!e.target.checkValidity()) {
      e.target.reportValidity();
      return;
    }

    setShowRecap(true);
  }

  async function confirmBooking() {
    setSubmitting(true);
    try {
      const { reservation } = await apiFetch('/reservations', {
        method: 'POST',
        body: {
          serviceId: selectedServiceId,
          addonIds: selectedAddonIds,
          date,
          startTime: selectedSlot,
          additionalGuests: guests.map((g) => ({ name: g.name.trim(), serviceId: g.serviceId, addonIds: g.addonIds })),
          ...form,
          atClientHome,
          clientAddress: atClientHome ? form.clientAddress.trim() : undefined,
        },
      });
      const totalPeople = guests.length + 1;
      setFeedback({
        type: 'success',
        text:
          totalPeople > 1
            ? `Votre demande de rendez-vous pour ${totalPeople} personnes a bien été envoyée. Vous recevrez une confirmation prochainement.`
            : 'Votre demande de rendez-vous a bien été envoyée. Vous recevrez une confirmation prochainement.',
      });
      setManageGroupId(reservation.groupId);
      showToast('Réservation envoyée avec succès !', 'success');
      saveContact({ clientName: form.clientName, clientEmail: form.clientEmail, clientPhone: form.clientPhone });
      setForm((f) => ({ ...f, notes: '', website: '' }));
      setSelectedAddonIds([]);
      setGuests([]);
      setSelectedSlot('');
      setSlots([]);
      setSlotsState('idle');
      setDate('');
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
      setShowRecap(false);
    }
  }

  return (
    <>
      <section className="section page-hero">
        <div className="container">
          <p className="eyebrow center">Réservation en ligne</p>
          <h1 className="center">Prenez rendez-vous en quelques clics</h1>
          <p className="section-lead center">
            Choisissez votre prestation, une date et un créneau disponible : votre demande est envoyée
            immédiatement au studio. Vous recevrez une confirmation par email.
          </p>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container booking-grid">
          <div className="booking-intro">
            <div className="hours-card">
              <h3>Horaires des prochains jours</h3>
              <ul>
                {hours.length === 0 && <li><span>Chargement…</span><span></span></li>}
                {hours.slice(0, HOURS_PREVIEW_DAYS).map((h) => (
                  <li key={h.date}>
                    <span>{DAY_NAMES[h.dayOfWeek].slice(0, 3)} {formatShortDate(h.date)}</span>
                    <span>{h.isClosed || h.ranges.length === 0 ? 'Fermé' : h.ranges.map((r) => `${r.openTime}–${r.closeTime}`).join(', ')}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="booking-contact-note">
              Une question avant de réserver ? Appelez-moi au <a href={`tel:${sitePhoneHref}`}>{sitePhone}</a>.
            </p>
          </div>

          <form className="card booking-form" noValidate onSubmit={handleSubmit}>
            <div className="form-row">
              <label>Type de prestation</label>
              <ServicePicker
                services={services}
                category={category}
                onCategoryChange={pickCategory}
                selectedServiceId={selectedServiceId}
                onSelectService={pickService}
              />
              <AddonCheckboxes service={selectedService} selectedIds={selectedAddonIds} onToggle={toggleAddon} />
            </div>

            <div className="form-row">
              <label>Lieu du rendez-vous</label>
              <div className="location-toggle" role="radiogroup" aria-label="Lieu du rendez-vous">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!atClientHome}
                  className={`location-option ${!atClientHome ? 'is-selected' : ''}`}
                  onClick={() => pickLocation(false)}
                >
                  Je viens sur place
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={atClientHome}
                  className={`location-option ${atClientHome ? 'is-selected' : ''}`}
                  onClick={() => pickLocation(true)}
                >
                  À domicile (elle se déplace)
                </button>
              </div>
            </div>

            {atClientHome && (
              <div className="form-row">
                <label htmlFor="clientAddress">Votre adresse</label>
                <input
                  type="text"
                  id="clientAddress"
                  autoComplete="street-address"
                  required
                  minLength={5}
                  maxLength={300}
                  placeholder="Numéro, rue, code postal, ville"
                  value={form.clientAddress}
                  onChange={updateField('clientAddress')}
                />
              </div>
            )}

            {guests.map((guest, i) => (
              <div className="guest-block" key={guest.key}>
                <div className="guest-block-header">
                  <label htmlFor={`guest-name-${guest.key}`}>Personne {i + 2} (ex : votre enfant)</label>
                  <button type="button" className="guest-remove-btn" onClick={() => removeGuest(guest.key)}>
                    Retirer
                  </button>
                </div>
                <input
                  type="text"
                  id={`guest-name-${guest.key}`}
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Nom complet"
                  value={guest.name}
                  onChange={(e) => updateGuest(guest.key, { name: e.target.value })}
                />
                <ServicePicker
                  services={services}
                  category={guest.category}
                  onCategoryChange={(c) => updateGuest(guest.key, { category: c, serviceId: null })}
                  selectedServiceId={guest.serviceId}
                  onSelectService={(id) => updateGuest(guest.key, { serviceId: id })}
                />
                <AddonCheckboxes
                  service={services.find((s) => s.id === guest.serviceId) || null}
                  selectedIds={guest.addonIds}
                  onToggle={(addonId, checked) => toggleGuestAddon(guest.key, addonId, checked)}
                />
              </div>
            ))}

            {guests.length < MAX_ADDITIONAL_GUESTS && (
              <button type="button" className="btn btn-outline add-guest-btn" onClick={addGuest} disabled={!selectedServiceId}>
                + Ajouter une personne (ex : votre enfant)
              </button>
            )}

            {totalDuration > 0 && (
              <p className="total-duration-note">
                Durée totale du rendez-vous : <strong>{formatDuration(totalDuration)}</strong>
                {guests.length > 0 ? ` pour ${guests.length + 1} personnes` : ''}.
              </p>
            )}

            {selectedServiceId && allGuestsHaveService && nextAvailable && nextAvailable !== 'loading' && nextAvailable !== 'none' && (
              <div className="suggestion-card">
                <span>
                  Prochain créneau disponible : <strong>
                    {DAY_NAMES[dayOfWeekFor(nextAvailable.date)].slice(0, 3)} {formatShortDate(nextAvailable.date)} à {nextAvailable.startTime}
                  </strong>
                </span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => applySuggestion(nextAvailable)}>
                  Réserver ce créneau
                </button>
              </div>
            )}
            {selectedServiceId && allGuestsHaveService && nextAvailable === 'loading' && (
              <p className="loading-text suggestion-loading">Recherche du prochain créneau disponible…</p>
            )}
            {selectedServiceId && allGuestsHaveService && nextAvailable === 'none' && (
              <p className="loading-text suggestion-loading">Aucun créneau disponible pour le moment sur les 60 prochains jours.</p>
            )}

            <div className="form-row" ref={dateSectionRef}>
              <label>Date</label>
              {!selectedService && <p className="loading-text day-picker-hint">Choisissez d'abord une prestation ci-dessus.</p>}
              {selectedService && hours.length === 0 && <p className="loading-text">Chargement des disponibilités…</p>}
              {selectedService && hours.length > 0 && (
                <div className="day-picker-scroll" role="listbox" aria-label="Choisir une date">
                  {hours.slice(0, DAY_PICKER_DAYS).map((h) => {
                    const isOpen = h.isSet && !h.isClosed && h.ranges.length > 0;
                    const isSelected = date === h.date;
                    return (
                      <button
                        key={h.date}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={`day-chip ${isOpen ? 'is-open' : 'is-closed'} ${isSelected ? 'is-selected' : ''}`}
                        disabled={!isOpen}
                        onClick={() => setDate(h.date)}
                      >
                        <span className="day-chip-dow">{DAY_NAMES[h.dayOfWeek].slice(0, 3)}</span>
                        <span className="day-chip-num">{formatShortDate(h.date)}</span>
                        <span className="day-chip-status">{isOpen ? 'Disponible' : 'Fermé'}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedService && (
                <details className="day-picker-fallback">
                  <summary>Choisir une date au-delà de {DAY_PICKER_DAYS} jours</summary>
                  <input
                    type="date"
                    id="date"
                    min={todayISO()}
                    max={maxDateISO()}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </details>
              )}
            </div>

            <div className="form-row">
              <label htmlFor="slot">Créneau disponible</label>
              <select
                id="slot"
                required
                disabled={slotsState !== 'ready'}
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.target.value)}
              >
                {slotsState === 'idle' && !allGuestsHaveService && (
                  <option value="">Complétez la prestation de chaque personne ajoutée</option>
                )}
                {slotsState === 'idle' && allGuestsHaveService && <option value="">Choisissez d'abord une prestation et une date</option>}
                {slotsState === 'loading' && <option value="">Chargement des créneaux…</option>}
                {slotsState === 'empty' && <option value="">Aucun créneau disponible ce jour-là</option>}
                {slotsState === 'error' && <option value="">Erreur de chargement</option>}
                {slotsState === 'ready' && (
                  <>
                    {slots.map((s) => (
                      <option key={s} value={s}>{s}{s === slots[0] ? ' (suggéré)' : ''}</option>
                    ))}
                  </>
                )}
              </select>
            </div>

            <div className="form-row">
              <label htmlFor="clientName">Nom complet {guests.length > 0 ? '(personne 1)' : ''}</label>
              <input type="text" id="clientName" autoComplete="name" required minLength={2} maxLength={100} value={form.clientName} onChange={updateField('clientName')} />
            </div>

            <div className="form-row two-col">
              <div>
                <label htmlFor="clientEmail">Email</label>
                <input type="email" id="clientEmail" autoComplete="email" required value={form.clientEmail} onChange={updateField('clientEmail')} />
              </div>
              <div>
                <label htmlFor="clientPhone">Téléphone</label>
                <input type="tel" id="clientPhone" autoComplete="tel" required placeholder="06 12 34 56 78" value={form.clientPhone} onChange={updateField('clientPhone')} />
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="notes">Message (optionnel)</label>
              <textarea id="notes" rows={3} maxLength={500} placeholder="Précisions sur votre demande…" value={form.notes} onChange={updateField('notes')} />
            </div>

            <div className="honeypot" aria-hidden="true">
              <label htmlFor="website">Ne pas remplir ce champ</label>
              <input type="text" id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={updateField('website')} />
            </div>

            {feedback && (
              <div className={`form-feedback ${feedback.type}`} role="status" aria-live="polite">
                {feedback.text}
                {manageGroupId && (
                  <>
                    {' '}
                    <Link to={`/mon-rendez-vous/${manageGroupId}`}>Voir ou annuler ce rendez-vous</Link>
                  </>
                )}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-block form-actions">
              Vérifier et confirmer ma demande
            </button>
          </form>
        </div>
      </section>

      {showRecap && (
        <div className="modal-overlay" onClick={() => !submitting && setShowRecap(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-label="Récapitulatif du rendez-vous" onClick={(e) => e.stopPropagation()}>
            <h2>Récapitulatif de votre rendez-vous</h2>

            <dl className="recap-list">
              <div>
                <dt>Date</dt>
                <dd>{DAY_NAMES[dayOfWeekFor(date)]} {formatShortDate(date)} à {selectedSlot}</dd>
              </div>
              <div>
                <dt>Lieu</dt>
                <dd>{atClientHome ? `À votre domicile — ${form.clientAddress.trim()}` : 'Sur place'}</dd>
              </div>
              <div>
                <dt>{recapGuests.length > 1 ? 'Personnes' : 'Prestation'}</dt>
                <dd>
                  <ul className="recap-guests">
                    {recapGuests.map((g, i) => (
                      <li key={i}>
                        {recapGuests.length > 1 && <strong>{g.name} — </strong>}
                        {g.service ? `${g.service.name} (${formatDuration(g.service.duration_minutes)})` : '—'}
                        {g.addons.length > 0 && ` + ${g.addons.map((a) => a.name).join(', ')}`}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
              <div>
                <dt>Durée / prix total</dt>
                <dd>{formatDuration(totalDuration)} — {formatPrice(totalPrice)}</dd>
              </div>
              <div>
                <dt>Contact</dt>
                <dd>{form.clientEmail}<br />{form.clientPhone}</dd>
              </div>
              {form.notes.trim() && (
                <div>
                  <dt>Message</dt>
                  <dd>{form.notes.trim()}</dd>
                </div>
              )}
            </dl>

            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setShowRecap(false)} disabled={submitting}>
                Modifier
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmBooking} disabled={submitting}>
                {submitting ? 'Envoi en cours…' : 'Confirmer le rendez-vous'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
