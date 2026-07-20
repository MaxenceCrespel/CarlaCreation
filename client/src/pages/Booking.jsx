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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function maxDateISO() {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}
function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
function dayOfWeekFor(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
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

  // Additional people booked in the same visit (e.g. a mother booking for
  // herself and her daughter): each has their own name, category and service.
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
  const totalDuration = useMemo(
    () => serviceIds.reduce((sum, id) => sum + (services.find((s) => s.id === id)?.duration_minutes ?? 0), 0),
    [serviceIds, services],
  );

  function pickCategory(key) {
    setCategory(key);
    setSelectedServiceId(null);
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
    setGuests((g) => [...g, { key: guestKeySeq, name: '', category: 'coiffure', serviceId: null }]);
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

  function updateGuest(key, patch) {
    setGuests((g) => g.map((guest) => (guest.key === key ? { ...guest, ...patch } : guest)));
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
    apiFetch(`/reservations/next-available?serviceIds=${serviceIds.join(',')}&atClientHome=${atClientHome}`)
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
  }, [serviceIds.join(','), allGuestsHaveService, atClientHome]);

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
    apiFetch(`/reservations/availability?date=${encodeURIComponent(date)}&serviceIds=${serviceIds.join(',')}&atClientHome=${atClientHome}`)
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
  }, [date, serviceIds.join(','), allGuestsHaveService, atClientHome]);

  function updateField(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
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

    setSubmitting(true);
    try {
      const { reservation } = await apiFetch('/reservations', {
        method: 'POST',
        body: {
          serviceId: selectedServiceId,
          date,
          startTime: selectedSlot,
          additionalGuests: guests.map((g) => ({ name: g.name.trim(), serviceId: g.serviceId })),
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
              Une question avant de réserver ? Appelez-nous au <a href={`tel:${sitePhoneHref}`}>{sitePhone}</a>.
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

            <button type="submit" className="btn btn-primary btn-block form-actions" disabled={submitting}>
              {submitting ? 'Envoi en cours…' : 'Confirmer ma demande de rendez-vous'}
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
