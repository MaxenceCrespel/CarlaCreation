import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useSiteConfig } from '../context/SiteConfigContext';
import { useToast } from '../context/ToastContext';
import { useSeo } from '../hooks/useSeo';
import { formatDuration, formatPrice } from '../utils/format';
import { getSavedContact, saveContact } from '../utils/contactStorage';
import AccountAuthForms from '../components/AccountAuthForms';
import ReferralCodeForm from '../components/ReferralCodeForm';
import { getStoredReferral } from '../utils/referralStorage';
import { categoriesForService, initialCategoryId } from '../utils/categoryParam';
import { BOOKING_DONE_KEY } from '../components/InstallAppBanner';

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const HOURS_PREVIEW_DAYS = 14;
const DAY_PICKER_DAYS = 30;
const MAX_ADDITIONAL_GUESTS = 5;
const STEPS = [
  { id: 1, label: 'Prestation' },
  { id: 2, label: 'Lieu' },
  { id: 3, label: 'Date' },
  { id: 4, label: 'Coordonnées' },
];

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
function firstTopLevelCategoryId(categories) {
  return categories.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order)[0]?.id ?? null;
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

// Category buttons + (when the picked category has any) subcategory
// buttons underneath, then clickable service cards — shared by the primary
// booker and each additional guest so picking a service always looks the
// same. Two levels only, e.g. "Coiffure" then "Hommes", like a
// category/subcategory nav on an e-commerce site rather than one long list.
// Email / phone sanity checks shown right under the field. Deliberately
// loose — the server stays the authority, this only catches typos early.
function contactFieldError(id, rawValue) {
  const value = rawValue.trim();
  if (id === 'clientEmail') {
    if (!value) return 'Indiquez votre email.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return "Vérifiez l'adresse (ex. : prenom@gmail.com).";
  }
  if (id === 'clientPhone') {
    if (!value) return 'Indiquez votre téléphone.';
    if (value.replace(/\D/g, '').length < 10) return 'Le numéro doit comporter au moins 10 chiffres.';
  }
  return null;
}

// A guest's own rate ("tarif étudiant") and an order-wide code stack: the code
// applies to what is left after the rate. Same rounding as the server.
const combinePercents = (rate, code) => Math.round(100 * (1 - (1 - rate / 100) * (1 - code / 100)));

const joinName = (first, last) => [first, last].map((p) => (p || '').trim()).filter(Boolean).join(' ');

function ServicePicker({ services, categories, category, onCategoryChange, subcategory, onSubcategoryChange, selectedServiceId, onSelectService }) {
  const topLevelCategories = useMemo(() => categories.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order), [categories]);
  const subcategories = useMemo(
    () => categories.filter((c) => c.parent_id === category).sort((a, b) => a.sort_order - b.sort_order),
    [categories, category],
  );
  const inCategory = useMemo(() => {
    const matchingCategoryIds = subcategory
      ? [subcategory]
      : categories.filter((c) => c.id === category || c.parent_id === category).map((c) => c.id);
    const idSet = new Set(matchingCategoryIds);
    return services.filter((s) => idSet.has(s.category_id));
  }, [services, categories, category, subcategory]);

  return (
    <>
      <div className="category-tabs" role="tablist" aria-label="Choisir une catégorie">
        {topLevelCategories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={category === c.id}
            className={`category-tab ${category === c.id ? 'is-active' : ''}`}
            onClick={() => onCategoryChange(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
      {subcategories.length > 0 && (
        <div className="subcategory-tabs" role="tablist" aria-label="Affiner par sous-catégorie">
          <button
            type="button"
            role="tab"
            aria-selected={!subcategory}
            className={`subcategory-tab ${!subcategory ? 'is-active' : ''}`}
            onClick={() => onSubcategoryChange(null)}
          >
            Tout
          </button>
          {subcategories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={subcategory === c.id}
              className={`subcategory-tab ${subcategory === c.id ? 'is-active' : ''}`}
              onClick={() => onSubcategoryChange(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
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
            {s.description && <p className="service-pick-description">{s.description}</p>}
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

// Persistent recap shown on steps after the prestation is picked, so the
// client never loses sight of what (and which supplements) they've chosen
// while moving through the rest of the flow.
function BookingSummary({ recapGuests, totalDuration, totalPrice }) {
  if (!recapGuests[0]?.service) return null;

  return (
    <div className="booking-summary">
      <ul className="booking-summary-items">
        {recapGuests.map((g, i) => (
          <li key={i}>
            {recapGuests.length > 1 && <strong>{g.name || `Personne ${i + 1}`} : </strong>}
            {g.service ? g.service.name : '—'}
            {g.addons.length > 0 && ` + ${g.addons.map((a) => a.name).join(', ')}`}
          </li>
        ))}
      </ul>
      <div className="booking-summary-total" aria-live="polite">
        <span className="booking-summary-meta">
          {recapGuests.length > 1 ? `${recapGuests.length} personnes · ` : ''}{formatDuration(totalDuration)}
        </span>
        <span className="booking-summary-price">{formatPrice(totalPrice)}</span>
      </div>
    </div>
  );
}

let guestKeySeq = 0;

export default function Booking() {
  const { sitePhone, sitePhoneHref, travelFeeFallbackCents, travelFreeRadiusKm, stripeEnabled } = useSiteConfig();
  useSeo({
    title: 'Rendez-vous coiffeuse et ongles à Loos, Lille',
    description:
      'Réservez votre rendez-vous coiffeuse ou ongles en ligne à Loos, près de Lille (Hauts-de-France), 24h/24, en quelques clics.',
    path: '/booking',
  });
  const showToast = useToast();

  const [step, setStep] = useState(1);

  // Account is optional: guests can always book. Logging in here (rather
  // than on a landing page) keeps the booking flow first — a logged-in
  // client's booking is linked to their account server-side by the cookie.
  const [account, setAccount] = useState(null); // null = guest, otherwise { name, email, phone }
  const [showAccountModal, setShowAccountModal] = useState(false);

  function loadAccount({ prefill } = {}) {
    return apiFetch('/client-auth/me')
      .then((me) => {
        setAccount({ name: me.name, email: me.email, phone: me.phone, canApplyReferral: Boolean(me.referral?.canApplyCode) });
        if (prefill) {
          setForm((f) => ({ ...f, firstName: me.firstName || f.firstName, lastName: me.lastName || f.lastName, clientName: me.name || f.clientName, clientEmail: me.email || f.clientEmail, clientPhone: me.phone || f.clientPhone }));
        }
      })
      .catch(() => setAccount(null));
  }

  useEffect(() => {
    loadAccount({ prefill: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function accountLogout() {
    await apiFetch('/client-auth/logout', { method: 'POST' });
    setAccount(null);
  }

  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState(null);
  const [searchParams] = useSearchParams();
  const [subcategory, setSubcategory] = useState(null);
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const prestationParam = Number(searchParams.get('prestation')) || null;
  const [selectedAddonIds, setSelectedAddonIds] = useState([]);

  // Additional people booked in the same visit (e.g. a mother booking for
  // herself and her daughter): each has their own name, category, service
  // and, if that service has any, selected addons.
  const [guests, setGuests] = useState([]);

  // Carla is a solo auto-entrepreneuse: the client either comes to her
  // (default) or she travels to the client's address instead.
  const [atClientHome, setAtClientHome] = useState(false);
  // null = not fetched yet, 'loading', 'unavailable' (geocoding off/failed
  // — falls back to the flat base fee), or { distanceKm, durationMinutes,
  // feeCents } once resolved.
  const [travelEstimate, setTravelEstimate] = useState(null);

  const [date, setDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [slotsState, setSlotsState] = useState('idle'); // idle | loading | ready | empty | error
  // Set when the last availability check came back empty specifically
  // because the round-trip travel time + service duration can never fit
  // that day's hours — distinct from "just fully booked".
  const [slotsTooFar, setSlotsTooFar] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [hours, setHours] = useState([]);
  // { 'YYYY-MM-DD': hasSlots } for the day picker's "Complet" label — an
  // open day with genuinely nothing left for this prestation reads very
  // differently from a closed one, and clients shouldn't have to tap every
  // open-looking day to find out.
  const [dayAvailability, setDayAvailability] = useState({});
  const [nextAvailable, setNextAvailable] = useState(null); // null | 'loading' | 'none' | { date, startTime }

  // Pre-fill from a previous visit so returning clients don't have to
  // retype their details every time; only saved locally in the browser.
  const [form, setForm] = useState(() => ({
    clientName: '',
    firstName: '',
    lastName: '',
    clientEmail: '',
    clientPhone: '',
    clientAddress: '',
    notes: '',
    website: '',
    ...getSavedContact(),
  }));
  const [feedback, setFeedback] = useState(null);
  // Id of the specific field currently flagged invalid (red border, see
  // .field-invalid) — set alongside `feedback` so the client doesn't have
  // to hunt for what's actually wrong, especially once the step has grown
  // long (several guests, addons...).
  const [invalidField, setInvalidField] = useState(null);
  const [manageGroupId, setManageGroupId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [showAddonNudge, setShowAddonNudge] = useState(false);
  // Only meaningful when Stripe is configured (stripeEnabled) — ignored
  // otherwise, the booking just stays a plain request with no payment step.
  // 'full' = payer en ligne maintenant; 'on_site' = payer sur place (Carla
  // encaisse plus tard, hors de ce système — voir paidOnSite côté admin).
  const [paymentOption, setPaymentOption] = useState('full');
  const [redirecting, setRedirecting] = useState(false);
  const [blurErrors, setBlurErrors] = useState({});

  // "Tarif spécial" (dropdown, e.g. tarif étudiant) and "code promo" (typed
  // + validated) are mutually exclusive — picking one clears the other, see
  // selectPromotion()/applyPromoCode() below. Only one ever reaches the
  // server, as either promotionId or promoCode.
  const [promotions, setPromotions] = useState([]);
  const [selectedPromotionId, setSelectedPromotionId] = useState('');
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoCodeState, setPromoCodeState] = useState('idle'); // idle | loading | valid | invalid
  const [appliedPromoCode, setAppliedPromoCode] = useState(null); // { code, label, discount_percent } once validated

  // 0 = the main person, i + 1 = guests[i] — only that person's service
  // form is shown, the others collapse into tabs.
  const [activePerson, setActivePerson] = useState(0);
  const formTopRef = useRef(null);
  const addonsSectionRef = useRef(null);
  const addGuestBtnRef = useRef(null);
  const stepActionsRef = useRef(null);
  // For steps whose invalid field isn't a single bordered input (the
  // prestation grid, a specific guest's whole block) — scrolled to and
  // outlined the same way as a real field, see focusInvalidField().
  const servicePickerRef = useRef(null);
  const guestBlockRefs = useRef({});
  const isFirstRender = useRef(true);

  // /booking?prestation=<id> (the "Réserver cette prestation" link of the price
  // list): open with that service already chosen, on the right category tab.
  useEffect(() => {
    if (!prestationParam || services.length === 0 || categories.length === 0) return;
    const wanted = services.find((s) => s.id === prestationParam);
    if (!wanted) return;
    const { category: cat, subcategory: sub } = categoriesForService(categories, wanted);
    setCategory(cat);
    setSubcategory(sub);
    setSelectedServiceId(wanted.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prestationParam, services.length, categories.length]);

  useEffect(() => {
    apiFetch('/services').then(setServices).catch(() => showToast('Impossible de charger les prestations.', 'error'));
    apiFetch('/service-categories')
      .then((cats) => {
        setCategories(cats);
        setCategory((current) => current ?? initialCategoryId(cats, searchParams.get('categorie')));
      })
      .catch(() => showToast('Impossible de charger les catégories.', 'error'));
    apiFetch('/hours')
      .then((data) => setHours(data.days))
      .catch(() => {});
    apiFetch('/promotions/selectable')
      .then(setPromotions)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectPromotion(id) {
    setSelectedPromotionId(id);
    setPromoCodeInput('');
    setPromoCodeState('idle');
    setAppliedPromoCode(null);
  }

  async function applyPromoCode() {
    const code = promoCodeInput.trim();
    if (!code) return;
    setPromoCodeState('loading');
    try {
      const promo = await apiFetch(`/promotions/by-code/${encodeURIComponent(code)}`);
      setAppliedPromoCode({ code, label: promo.label, discount_percent: promo.discount_percent, discount_cents: promo.discount_cents ?? 0 });
      setPromoCodeState('valid');
    } catch {
      setAppliedPromoCode(null);
      setPromoCodeState('invalid');
      showToast('Code promo invalide ou expiré.', 'error');
    }
  }

  // Every step change scrolls the card back into view — steps vary a lot
  // in height, so without this the client could land mid-page after
  // "Suivant" on a shorter step.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step]);

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
  // Uses the live per-address estimate once it's resolved; falls back to
  // the flat base fee while it's loading, unavailable, or geocoding is
  // disabled — the client never sees a $0 quote just because the estimate
  // hasn't landed yet.
  const travelFeeCents = atClientHome
    ? (travelEstimate && typeof travelEstimate === 'object' ? travelEstimate.feeCents : travelFeeFallbackCents)
    : 0;
  const servicesSubtotal = useMemo(
    () => serviceIds.reduce((sum, id) => sum + (services.find((s) => s.id === id)?.price_cents ?? 0), 0) + totalAddonPrice,
    [serviceIds, services, totalAddonPrice],
  );
  const totalPrice = useMemo(() => servicesSubtotal + travelFeeCents, [servicesSubtotal, travelFeeCents]);

  // Each person's own discount: their personal "tarif spécial" if they
  // picked one for themselves, otherwise the order-wide promo code (if
  // any) — a personal rate never stacks with the code, it just takes
  // priority for that one person. Discount only ever applies to a
  // person's own prestation+suppléments, never the travel fee — same
  // basis as the backend (ReservationsService / DashboardService /
  // InvoicesService all agree on this).
  const pricedGuests = useMemo(() => {
    const codePercent = appliedPromoCode?.discount_percent ?? 0;
    const priceFor = (service, addonIds) => {
      const base = service?.price_cents ?? 0;
      const addonsPrice = (service?.addons ?? []).filter((a) => addonIds.includes(a.id)).reduce((sum, a) => sum + a.extra_price_cents, 0);
      return base + addonsPrice;
    };
    const ownPromo = (promotionId) => (promotionId ? promotions.find((p) => p.id === Number(promotionId)) : null);
    const rows = [
      (() => {
        const promo = ownPromo(selectedPromotionId);
        return {
          name: form.clientName,
          priceCents: priceFor(selectedService, selectedAddonIds),
          discountPercent: combinePercents(promo ? promo.discount_percent : 0, codePercent),
          discountLabel: [promo?.label, appliedPromoCode?.label].filter(Boolean).join(' + '),
          usesCode: Boolean(appliedPromoCode),
        };
      })(),
      ...guests.map((g) => {
        const svc = services.find((s) => s.id === g.serviceId) || null;
        const promo = ownPromo(g.promotionId);
        return {
          name: g.name,
          priceCents: priceFor(svc, g.addonIds),
          discountPercent: combinePercents(promo ? promo.discount_percent : 0, codePercent),
          discountLabel: [promo?.label, appliedPromoCode?.label].filter(Boolean).join(' + '),
          usesCode: Boolean(appliedPromoCode),
        };
      }),
    ];
    // A fixed-euro code (loyalty reward) comes off every guest in order, after
    // their percentage, never below zero — same allocation as the backend.
    let remainingFixed = appliedPromoCode?.discount_cents ?? 0;
    return rows.map((r) => {
      const percentCents = Math.round(r.priceCents * (r.discountPercent / 100));
      let fixedCents = 0;
      if (r.usesCode && remainingFixed > 0) {
        fixedCents = Math.min(remainingFixed, r.priceCents - percentCents);
        remainingFixed -= fixedCents;
      }
      return { ...r, discountCents: percentCents + fixedCents };
    });
  }, [form.clientName, selectedService, selectedAddonIds, selectedPromotionId, guests, services, promotions, appliedPromoCode]);
  const discountCents = useMemo(() => pricedGuests.reduce((sum, g) => sum + g.discountCents, 0), [pricedGuests]);
  const finalPrice = totalPrice - discountCents;
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

  // People whose chosen service has supplements available but none picked
  // yet — used to nudge once before leaving step 1, instead of letting the
  // client tab through without ever noticing they exist.
  const addonNudgeTargets = useMemo(() => {
    const targets = [];
    if (selectedService?.addons?.length > 0 && selectedAddonIds.length === 0) {
      targets.push({ name: form.clientName.trim() || 'vous', addons: selectedService.addons });
    }
    guests.forEach((g) => {
      const svc = services.find((s) => s.id === g.serviceId);
      if (svc?.addons?.length > 0 && g.addonIds.length === 0) {
        targets.push({ name: g.name.trim() || 'cette personne', addons: svc.addons });
      }
    });
    return targets;
  }, [selectedService, selectedAddonIds, guests, services, form.clientName]);

  function pickCategory(key) {
    setCategory(key);
    setSubcategory(null);
    setSelectedServiceId(null);
    setSelectedAddonIds([]);
    setSlots([]);
    setSlotsState('idle');
    setSelectedSlot('');
  }

  function pickSubcategory(id) {
    setSubcategory(id);
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

  // Separate from updateGuest (which resets addonIds — see above) since
  // picking a "tarif spécial" doesn't change the service, so their chosen
  // addons must stay put.
  function updateGuestPromotion(key, promotionId) {
    setGuests((g) => g.map((guest) => (guest.key === key ? { ...guest, promotionId } : guest)));
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
    setTravelEstimate(null);
    setSlots([]);
    setSlotsState('idle');
    setSelectedSlot('');
  }

  function pickService(id) {
    if (invalidField === 'service-picker') setInvalidField(null);
    setSelectedServiceId(id);
    setSelectedAddonIds([]);
    setSlots([]);
    setSlotsState('idle');
    setSelectedSlot('');
    // Move on down to "Ajouter une personne" / "Suivant" (supplements, when
    // there are any, render just above and stay in view) — never back up to
    // the service grid the client just picked from.
    requestAnimationFrame(() => {
      (addGuestBtnRef.current || stepActionsRef.current)?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }

  function addGuest() {
    if (guests.length >= MAX_ADDITIONAL_GUESTS) return;
    guestKeySeq += 1;
    setGuests((g) => [...g, { key: guestKeySeq, name: '', firstName: '', lastName: '', category: firstTopLevelCategoryId(categories), subcategory: null, serviceId: null, addonIds: [], promotionId: '' }]);
    setSlots([]);
    setSlotsState('idle');
    setSelectedSlot('');
    setActivePerson(guests.length + 1);
    requestAnimationFrame(() => {
      document.getElementById('person-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function removeGuest(key) {
    setActivePerson(0);
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

  // Settles 700ms after the client stops typing their à-domicile address —
  // shared by the travel estimate, next-available and availability effects
  // below so none of them (nor the geocoding API behind them) fire on every
  // keystroke, and slot availability reflects the real travel time to this
  // specific address once it's known.
  const [debouncedAddress, setDebouncedAddress] = useState('');
  useEffect(() => {
    const address = form.clientAddress.trim();
    if (!atClientHome || address.length < 5) {
      setDebouncedAddress('');
      return undefined;
    }
    const timer = setTimeout(() => setDebouncedAddress(address), 700);
    return () => clearTimeout(timer);
  }, [atClientHome, form.clientAddress]);

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
    const addressParam = debouncedAddress ? `&address=${encodeURIComponent(debouncedAddress)}` : '';
    apiFetch(`/reservations/next-available?serviceIds=${serviceIds.join(',')}&atClientHome=${atClientHome}&addonMinutes=${totalAddonMinutes}${addressParam}`)
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
  }, [serviceIds.join(','), allGuestsHaveService, atClientHome, totalAddonMinutes, debouncedAddress]);

  // Powers the "Complet" label on the day picker below — same trigger as
  // the next-available suggestion above.
  useEffect(() => {
    if (!selectedServiceId || !allGuestsHaveService) {
      setDayAvailability({});
      return;
    }
    let cancelled = false;
    const addressParam = debouncedAddress ? `&address=${encodeURIComponent(debouncedAddress)}` : '';
    apiFetch(`/reservations/day-availability?serviceIds=${serviceIds.join(',')}&atClientHome=${atClientHome}&addonMinutes=${totalAddonMinutes}&days=${DAY_PICKER_DAYS}${addressParam}`)
      .then((result) => {
        if (cancelled) return;
        setDayAvailability(Object.fromEntries(result.map((d) => [d.date, d.slotCount ?? (d.hasSlots ? 1 : 0)])));
      })
      .catch(() => {
        if (!cancelled) setDayAvailability({});
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceIds.join(','), allGuestsHaveService, atClientHome, totalAddonMinutes, debouncedAddress]);

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
    const addressParam = debouncedAddress ? `&address=${encodeURIComponent(debouncedAddress)}` : '';
    apiFetch(`/reservations/availability?date=${encodeURIComponent(date)}&serviceIds=${serviceIds.join(',')}&atClientHome=${atClientHome}&addonMinutes=${totalAddonMinutes}${addressParam}`)
      .then((result) => {
        if (cancelled) return;
        setSlots(result.slots);
        setSlotsState(result.slots.length ? 'ready' : 'empty');
        setSlotsTooFar(Boolean(result.tooFarForAnyOpenRange));
        // Auto-suggest the earliest slot of the chosen day so most clients
        // can just confirm instead of opening the dropdown themselves.
        setSelectedSlot(result.slots[0] || '');
      })
      .catch(() => {
        if (!cancelled) {
          setSlotsState('error');
          showToast('Erreur de chargement des créneaux.', 'error');
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, serviceIds.join(','), allGuestsHaveService, atClientHome, totalAddonMinutes, debouncedAddress]);

  // Live distance/duration/fee preview while the client fills in their
  // à-domicile address — reuses the same debounced value as above.
  useEffect(() => {
    if (!debouncedAddress) {
      setTravelEstimate(null);
      return undefined;
    }
    let cancelled = false;
    setTravelEstimate('loading');
    apiFetch(`/reservations/travel-estimate?address=${encodeURIComponent(debouncedAddress)}`)
      .then((result) => {
        if (cancelled) return;
        setTravelEstimate(result.available ? result : 'unavailable');
      })
      .catch(() => {
        if (!cancelled) setTravelEstimate('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedAddress]);

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

  // First and last name are separate inputs (compound names are common);
  // `clientName` stays the joined string everything else reads.
  function updateName(part, value) {
    setForm((f) => {
      const next = { ...f, [part]: value };
      return { ...next, clientName: joinName(next.firstName, next.lastName) };
    });
  }

  // Unlike updateGuest, typing a name must not reset the guest's addons/slots.
  function updateGuestName(key, part, value) {
    setGuests((g) =>
      g.map((guest) => {
        if (guest.key !== key) return guest;
        const next = { ...guest, [part]: value };
        return { ...next, name: joinName(next.firstName, next.lastName) };
      }),
    );
  }

  // Each step validates only what it's responsible for — returns
  // { message, fieldId } (fieldId names the input to jump to and outline in
  // red, see focusInvalidField — null when there's no single input for it),
  // or null when the step is complete and it's safe to move on.
  function validateStep(n) {
    if (n === 1) {
      if (!form.firstName.trim()) return { message: 'Indiquez votre prénom.', fieldId: 'clientFirstName' };
      if (!form.lastName.trim()) return { message: 'Indiquez votre nom.', fieldId: 'clientLastName' };
      if (!selectedServiceId) return { message: 'Choisissez une prestation.', fieldId: 'service-picker' };
      const badGuest = guests.find((g) => !g.firstName.trim() || !g.lastName.trim() || !g.serviceId);
      if (badGuest) {
        if (!badGuest.firstName.trim()) return { message: 'Indiquez le prénom de chaque personne ajoutée, ou retirez-la.', fieldId: `guest-name-${badGuest.key}` };
        if (!badGuest.lastName.trim()) return { message: 'Indiquez le nom de chaque personne ajoutée, ou retirez-la.', fieldId: `guest-lastname-${badGuest.key}` };
        return { message: 'Choisissez une prestation pour chaque personne ajoutée, ou retirez-la.', fieldId: `guest-block-${badGuest.key}` };
      }
      return null;
    }
    if (n === 2) {
      if (atClientHome) {
        const address = form.clientAddress.trim();
        if (!address) return { message: 'Indiquez votre adresse pour un rendez-vous à domicile.', fieldId: 'clientAddress' };
        if (address.length < 5) return { message: 'Indiquez une adresse complète.', fieldId: 'clientAddress' };
        // debouncedAddress only catches up ~700ms after typing stops, and
        // travelEstimate resolves after that — moving on before either is
        // done would let the next steps compute availability/price off a
        // stale or missing distance instead of the real one.
        if (debouncedAddress !== address || travelEstimate === 'loading') {
          return { message: 'Merci de patienter quelques instants, calcul du trajet en cours…', fieldId: null };
        }
      }
      return null;
    }
    if (n === 3) {
      if (!date || !selectedSlot) return { message: 'Choisissez une date et un créneau.', fieldId: 'slot' };
      return null;
    }
    if (n === 4) {
      const emailError = contactFieldError('clientEmail', form.clientEmail);
      if (emailError) return { message: emailError, fieldId: 'clientEmail' };
      const phoneError = contactFieldError('clientPhone', form.clientPhone);
      if (phoneError) return { message: phoneError, fieldId: 'clientPhone' };
    }
    return null;
  }

  // Inline error under a field: a blur-time one (email / phone, shown as soon
  // as the client leaves the field) or the step validation's, when that is
  // the field it points at.
  function inlineError(id) {
    if (blurErrors[id]) return blurErrors[id];
    return invalidField === id && feedback?.type === 'error' ? feedback.text : null;
  }

  function blurValidate(id, value) {
    const message = contactFieldError(id, value);
    setBlurErrors((e) => ({ ...e, [id]: message }));
    if (message && value.trim()) showToast(message, 'error');
  }

  // Scrolls to and outlines in red the field a validation error points at
  // — a real input gets focused directly; the prestation grid and a
  // specific guest's block (not single inputs) get their container
  // outlined via the matching ref instead. Runs from an effect (below),
  // not straight from the click handler, so it also works when the error
  // forces a step change first (handleSubmit's final re-check) — the
  // target field doesn't exist in the DOM until that new step has
  // rendered.
  useEffect(() => {
    if (!invalidField) return;
    const guestKey = /^guest-(?:block|name|lastname)-(\d+)$/.exec(invalidField)?.[1];
    const guestIndex = guestKey ? guests.findIndex((g) => String(g.key) === guestKey) : -1;
    const owner = guestIndex >= 0 ? guestIndex + 1 : 0;
    if (step === 1 && owner !== activePerson) {
      setActivePerson(owner);
      return;
    }
    if (invalidField === 'service-picker') {
      servicePickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (invalidField.startsWith('guest-block-')) {
      guestBlockRefs.current[invalidField]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const el = document.getElementById(invalidField);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invalidField, step, activePerson]);

  function goNext() {
    const error = validateStep(step);
    if (error) {
      setFeedback({ type: 'error', text: error.message });
      showToast(error.message, 'error');
      setInvalidField(error.fieldId);
      return;
    }
    // One soft nudge before leaving step 1 if a chosen service has
    // supplements nobody's added yet — easy to miss even with the
    // auto-scroll, and it's the one moment worth a gentle upsell.
    if (step === 1 && addonNudgeTargets.length > 0) {
      setShowAddonNudge(true);
      return;
    }
    setFeedback(null);
    setInvalidField(null);
    setStep((s) => Math.min(4, s + 1));
  }

  function confirmSkipAddons() {
    setShowAddonNudge(false);
    setFeedback(null);
    setStep((s) => Math.min(4, s + 1));
  }

  function reviewAddons() {
    setShowAddonNudge(false);
    requestAnimationFrame(() => {
      addonsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }

  function goBack() {
    setFeedback(null);
    setInvalidField(null);
    setStep((s) => Math.max(1, s - 1));
  }

  function goToStep(n) {
    if (n >= step) return;
    setFeedback(null);
    setInvalidField(null);
    setStep(n);
  }

  // On any step but the last, Enter/"Suivant" just advances instead of
  // submitting — the actual API call only ever happens from step 4, and
  // only once the client has reviewed and confirmed the recap modal.
  function handleSubmit(e) {
    e.preventDefault();
    if (step < 4) {
      goNext();
      return;
    }

    setFeedback(null);
    setManageGroupId(null);

    for (let n = 1; n <= 4; n += 1) {
      const error = validateStep(n);
      if (error) {
        setFeedback({ type: 'error', text: error.message });
        showToast(error.message, 'error');
        setStep(n);
        setInvalidField(error.fieldId);
        return;
      }
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
          additionalGuests: guests.map((g) => ({
            name: g.name.trim(),
            serviceId: g.serviceId,
            addonIds: g.addonIds,
            promotionId: g.promotionId ? Number(g.promotionId) : undefined,
          })),
          // firstName / lastName are form-only (joined into clientName already).
          ...Object.fromEntries(Object.entries(form).filter(([key]) => key !== 'firstName' && key !== 'lastName')),
          clientName: joinName(form.firstName, form.lastName),
          atClientHome,
          clientAddress: atClientHome ? form.clientAddress.trim() : undefined,
          promotionId: selectedPromotionId ? Number(selectedPromotionId) : undefined,
          promoCode: promoCodeState === 'valid' ? appliedPromoCode?.code : undefined,
          paymentOption: stripeEnabled && paymentOption === 'full' ? 'full' : undefined,
        },
      });

      // Lets the home-screen install banner appear after a first booking.
      try {
        localStorage.setItem(BOOKING_DONE_KEY, String(Date.now()));
      } catch {
        // storage unavailable — non-critical
      }

      // Client chose to pay online: hand off to Stripe's own checkout page
      // rather than showing the usual local success message — the booking
      // already exists (pending), payment just secures it.
      // Stripe redirects back to /mon-rendez-vous/:groupId once done either
      // way (paid or abandoned), see ReservationsService.create.
      if (reservation.checkoutUrl) {
        setRedirecting(true);
        window.location.href = reservation.checkoutUrl;
        return;
      }

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
      saveContact({ clientName: form.clientName, firstName: form.firstName, lastName: form.lastName, clientEmail: form.clientEmail, clientPhone: form.clientPhone });
      setForm((f) => ({ ...f, notes: '', website: '' }));
      setSelectedAddonIds([]);
      setGuests([]);
      selectPromotion('');
      setSelectedSlot('');
      setSlots([]);
      setSlotsState('idle');
      setDate('');
      setStep(1);
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

          <form className="card booking-form" noValidate onSubmit={handleSubmit} ref={formTopRef}>
            <p className="booking-step-status">
              <span>Étape {step} sur {STEPS.length} · <strong>{STEPS[step - 1].label}</strong></span>
              {STEPS[step] && <span>Ensuite : {STEPS[step].label.toLowerCase()}</span>}
            </p>
            <div className="booking-steps" role="tablist" aria-label="Étapes de réservation">
              {STEPS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={step === s.id}
                  className={`booking-step ${step === s.id ? 'is-active' : ''} ${step > s.id ? 'is-done' : ''}`}
                  disabled={s.id > step}
                  onClick={() => goToStep(s.id)}
                >
                  <span className="booking-step-num">{step > s.id ? '✓' : s.id}</span>
                  <span className="booking-step-label">{s.label}</span>
                </button>
              ))}
            </div>


            {step === 1 && (
              <>
                {guests.length > 0 && (
                  <div className="person-tabs" id="person-tabs" role="tablist" aria-label="Personnes du rendez-vous">
                    {[form.firstName, ...guests.map((g) => g.firstName)].map((name, i) => {
                      const done = i === 0 ? !!selectedServiceId : !!guests[i - 1].serviceId;
                      return (
                        <button
                          key={i === 0 ? 'main' : guests[i - 1].key}
                          type="button"
                          role="tab"
                          aria-selected={activePerson === i}
                          className={`person-tab ${activePerson === i ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
                          onClick={() => setActivePerson(i)}
                        >
                          <span className="person-tab-mark" aria-hidden="true">{done ? '✓' : i + 1}</span>
                          <span className="person-tab-name">{name.trim() || `Personne ${i + 1}`}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div hidden={activePerson !== 0}>
                <div className="form-row two-col">
                  <div>
                    <label htmlFor="clientFirstName">Prénom {guests.length > 0 ? '(personne 1)' : ''}</label>
                    <input
                      type="text"
                      id="clientFirstName"
                      className={invalidField === 'clientFirstName' ? 'field-invalid' : ''}
                      autoComplete="given-name"
                      required
                      maxLength={100}
                      value={form.firstName}
                      aria-invalid={invalidField === 'clientFirstName' ? 'true' : undefined}
                      onChange={(e) => {
                        updateName('firstName', e.target.value);
                        if (invalidField === 'clientFirstName') setInvalidField(null);
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor="clientLastName">Nom</label>
                    <input
                      type="text"
                      id="clientLastName"
                      className={invalidField === 'clientLastName' ? 'field-invalid' : ''}
                      autoComplete="family-name"
                      required
                      maxLength={100}
                      value={form.lastName}
                      aria-invalid={invalidField === 'clientLastName' ? 'true' : undefined}
                      onChange={(e) => {
                        updateName('lastName', e.target.value);
                        if (invalidField === 'clientLastName') setInvalidField(null);
                      }}
                    />
                  </div>
                </div>

                <div className={`form-row ${invalidField === 'service-picker' ? 'field-invalid' : ''}`} ref={servicePickerRef}>
                  <label>Type de prestation</label>
                  <ServicePicker
                    services={services}
                    categories={categories}
                    category={category}
                    onCategoryChange={pickCategory}
                    subcategory={subcategory}
                    onSubcategoryChange={pickSubcategory}
                    selectedServiceId={selectedServiceId}
                    onSelectService={pickService}
                  />
                  <div ref={addonsSectionRef}>
                    <AddonCheckboxes service={selectedService} selectedIds={selectedAddonIds} onToggle={toggleAddon} />
                  </div>
                </div>

                {promotions.length > 0 && (
                  <div className="form-row">
                    <label htmlFor="promotion-select">Tarif spécial de cette personne (optionnel)</label>
                    <select id="promotion-select" value={selectedPromotionId} onChange={(e) => setSelectedPromotionId(e.target.value)}>
                      <option value="">Tarif standard</option>
                      {promotions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} (-{p.discount_percent}%)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                </div>

                {guests.map((guest, i) => (
                  <div
                    hidden={activePerson !== i + 1}
                    className={`guest-block ${invalidField === `guest-block-${guest.key}` ? 'field-invalid' : ''}`}
                    key={guest.key}
                    ref={(el) => {
                      guestBlockRefs.current[`guest-block-${guest.key}`] = el;
                    }}
                  >
                    <div className="guest-block-header">
                      <label htmlFor={`guest-name-${guest.key}`}>Personne {i + 2} (ex : votre enfant)</label>
                      <button type="button" className="guest-remove-btn" onClick={() => removeGuest(guest.key)}>
                        Retirer
                      </button>
                    </div>
                    <div className="form-row two-col">
                      <div>
                        <input
                          type="text"
                          id={`guest-name-${guest.key}`}
                          className={invalidField === `guest-name-${guest.key}` ? 'field-invalid' : ''}
                          required
                          maxLength={100}
                          placeholder="Prénom"
                          aria-label={`Prénom de la personne ${i + 2}`}
                          value={guest.firstName}
                          onChange={(e) => {
                            updateGuestName(guest.key, 'firstName', e.target.value);
                            if (invalidField === `guest-name-${guest.key}`) setInvalidField(null);
                          }}
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          id={`guest-lastname-${guest.key}`}
                          className={invalidField === `guest-lastname-${guest.key}` ? 'field-invalid' : ''}
                          required
                          maxLength={100}
                          placeholder="Nom"
                          aria-label={`Nom de la personne ${i + 2}`}
                          value={guest.lastName}
                          onChange={(e) => {
                            updateGuestName(guest.key, 'lastName', e.target.value);
                            if (invalidField === `guest-lastname-${guest.key}`) setInvalidField(null);
                          }}
                        />
                      </div>
                    </div>
                    <ServicePicker
                      services={services}
                      categories={categories}
                      category={guest.category}
                      onCategoryChange={(c) => updateGuest(guest.key, { category: c, subcategory: null, serviceId: null })}
                      subcategory={guest.subcategory}
                      onSubcategoryChange={(s) => updateGuest(guest.key, { subcategory: s, serviceId: null })}
                      selectedServiceId={guest.serviceId}
                      onSelectService={(id) => {
                        if (invalidField === `guest-block-${guest.key}`) setInvalidField(null);
                        updateGuest(guest.key, { serviceId: id });
                        requestAnimationFrame(() => {
                          (addGuestBtnRef.current || stepActionsRef.current)?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                        });
                      }}
                    />
                    <AddonCheckboxes
                      service={services.find((s) => s.id === guest.serviceId) || null}
                      selectedIds={guest.addonIds}
                      onToggle={(addonId, checked) => toggleGuestAddon(guest.key, addonId, checked)}
                    />
                    {promotions.length > 0 && (
                      <div className="form-row">
                        <label htmlFor={`guest-promotion-${guest.key}`}>Tarif spécial de cette personne (optionnel)</label>
                        <select
                          id={`guest-promotion-${guest.key}`}
                          value={guest.promotionId}
                          onChange={(e) => updateGuestPromotion(guest.key, e.target.value)}
                        >
                          <option value="">Tarif standard</option>
                          {promotions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label} (-{p.discount_percent}%)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}

                {guests.length < MAX_ADDITIONAL_GUESTS && (
                  <button type="button" className="btn btn-outline add-guest-btn" ref={addGuestBtnRef} onClick={addGuest} disabled={!selectedServiceId || guests.some((g) => !g.serviceId)}>
                    + Ajouter une personne (ex : votre enfant)
                  </button>
                )}

                {totalDuration > 0 && (
                  <p className="total-duration-note">
                    Durée totale du rendez-vous : <strong>{formatDuration(totalDuration)}</strong>
                    {guests.length > 0 ? ` pour ${guests.length + 1} personnes` : ''}.
                  </p>
                )}
              </>
            )}

            {step === 2 && (
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
                    <span className="location-option-title">Au studio</span>
                    <span className="location-option-sub">Adresse exacte envoyée avec la confirmation</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={atClientHome}
                    className={`location-option ${atClientHome ? 'is-selected' : ''}`}
                    onClick={() => pickLocation(true)}
                  >
                    <span className="location-option-title">À domicile</span>
                    <span className="location-option-sub">Carla se déplace avec tout le matériel</span>
                  </button>
                </div>

                {atClientHome && Number.isFinite(travelFreeRadiusKm) && (
                  <p className="travel-info">
                    <strong>Déplacement offert jusqu'à {travelFreeRadiusKm} km.</strong> Au-delà, des frais de
                    déplacement peuvent s'appliquer.
                  </p>
                )}

                {atClientHome && (
                  <div className="form-row">
                    <label htmlFor="clientAddress">Votre adresse</label>
                    <input
                      type="text"
                      id="clientAddress"
                      className={invalidField === 'clientAddress' ? 'field-invalid' : ''}
                      autoComplete="street-address"
                      required
                      minLength={5}
                      maxLength={300}
                      placeholder="Numéro, rue, code postal, ville"
                      value={form.clientAddress}
                      aria-invalid={inlineError('clientAddress') ? 'true' : undefined}
                      aria-describedby={inlineError('clientAddress') ? 'clientAddress-error' : undefined}
                      onChange={(e) => {
                        updateField('clientAddress')(e);
                        if (invalidField === 'clientAddress') setInvalidField(null);
                      }}
                    />
                    {travelEstimate === 'loading' && <p className="loading-text travel-estimate-hint">Calcul du trajet…</p>}
                    {travelEstimate && typeof travelEstimate === 'object' && (
                      <p className="travel-estimate-hint travel-estimate-card" role="status">
                        ≈ {travelEstimate.distanceKm} km · {travelEstimate.durationMinutes} min de route
                        {travelEstimate.feeCents > 0
                          ? ` · +${formatPrice(travelEstimate.feeCents)} de frais de déplacement`
                          : ' · déplacement gratuit'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <>
                {nextAvailable && nextAvailable !== 'loading' && nextAvailable !== 'none' && (
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
                {nextAvailable === 'loading' && (
                  <p className="loading-text suggestion-loading">Recherche du prochain créneau disponible…</p>
                )}
                {nextAvailable === 'none' && (
                  <p className="loading-text suggestion-loading">Aucun créneau disponible pour le moment sur les 60 prochains jours.</p>
                )}

                <div className="form-row">
                  <label>Date</label>
                  {hours.length === 0 && <p className="loading-text">Chargement des disponibilités…</p>}
                  {hours.length > 0 && (
                    <div className="day-picker-scroll" role="listbox" aria-label="Choisir une date">
                      {hours.slice(0, DAY_PICKER_DAYS).map((h) => {
                        const isOpen = h.isSet && !h.isClosed && h.ranges.length > 0;
                        const slotCount = dayAvailability[h.date];
                        const isFull = isOpen && slotCount === 0;
                        const isSelected = date === h.date;
                        return (
                          <button
                            key={h.date}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={`day-chip ${isOpen ? (isFull ? 'is-full' : 'is-open') : 'is-closed'} ${isSelected ? 'is-selected' : ''}`}
                            disabled={!isOpen || isFull}
                            onClick={() => setDate(h.date)}
                          >
                            <span className="day-chip-dow">{DAY_NAMES[h.dayOfWeek].slice(0, 3)}</span>
                            <span className="day-chip-num">{formatShortDate(h.date)}</span>
                            <span className="day-chip-status">{!isOpen ? 'Fermé' : isFull ? 'Complet' : slotCount > 0 ? `${slotCount} créneau${slotCount > 1 ? 'x' : ''}` : 'Disponible'}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
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
                </div>

                <div className="form-row">
                  <label id="slot-label">Créneau disponible</label>
                  <div
                    id="slot"
                    className={`slot-groups ${invalidField === 'slot' ? 'field-invalid' : ''}`}
                    role="radiogroup"
                    aria-labelledby="slot-label"
                    aria-busy={slotsState === 'loading'}
                  >
                    {slotsState === 'idle' && <p className="form-hint">Choisissez d'abord une date.</p>}
                    {slotsState === 'loading' && <p className="loading-text">Chargement des créneaux…</p>}
                    {slotsState === 'empty' && (
                      <p className="form-hint">{slotsTooFar ? 'Trajet trop long pour ce jour.' : 'Aucun créneau disponible ce jour-là.'}</p>
                    )}
                                        {slotsState === 'ready' &&
                      [['Matin', slots.filter((t) => t < '12:00')], ['Après-midi', slots.filter((t) => t >= '12:00')]]
                        .filter(([, list]) => list.length > 0)
                        .map(([label, list]) => (
                          <div key={label} className="slot-group">
                            <span className="slot-group-label">{label}</span>
                            <div className="slot-chips">
                              {list.map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  role="radio"
                                  aria-checked={selectedSlot === t}
                                  className={`slot-chip ${selectedSlot === t ? 'is-selected' : ''}`}
                                  onClick={() => {
                                    setSelectedSlot(t);
                                    if (invalidField === 'slot') setInvalidField(null);
                                  }}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                  </div>
                  {slotsState === 'empty' && slotsTooFar && (
                    <p className="form-feedback error">
                      Avec le trajet aller-retour jusqu'à votre adresse et la durée de la prestation, ce rendez-vous
                      ne peut tenir dans les horaires d'ouverture de cette journée. Essayez une autre date, ou
                      contactez-moi directement pour en discuter.
                    </p>
                  )}
                </div>
              </>
            )}

            {step === 4 && (
              <>
                {account ? (
                  <div className="account-banner is-connected">
                    <span>
                      <strong>{account.name}</strong> — compte connecté : vos points de fidélité seront crédités.
                    </span>
                    <button type="button" className="link-btn" onClick={accountLogout}>Changer de compte</button>
                  </div>
                ) : (
                  <div className="account-banner">
                    <span>Déjà un compte, ou envie d'en créer un pour cumuler des points ? C'est facultatif.</span>
                    <button type="button" className="link-btn" onClick={() => setShowAccountModal(true)}>Se connecter / créer un compte</button>
                  </div>
                )}
                <div className="form-row two-col">
                  <div>
                    <label htmlFor="clientEmail">Email</label>
                    <input
                      type="email"
                      id="clientEmail"
                      className={inlineError('clientEmail') ? 'field-invalid' : ''}
                      autoComplete="email"
                      required
                      value={form.clientEmail}
                      aria-invalid={inlineError('clientEmail') ? 'true' : undefined}
                      aria-describedby={inlineError('clientEmail') ? 'clientEmail-error' : undefined}
                      onChange={(e) => {
                        updateField('clientEmail')(e);
                        setBlurErrors((b) => ({ ...b, clientEmail: null }));
                        if (invalidField === 'clientEmail') setInvalidField(null);
                      }}
                      onBlur={(e) => blurValidate('clientEmail', e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="clientPhone">Téléphone</label>
                    <input
                      type="tel"
                      id="clientPhone"
                      className={inlineError('clientPhone') ? 'field-invalid' : ''}
                      autoComplete="tel"
                      required
                      placeholder="06 12 34 56 78"
                      value={form.clientPhone}
                      aria-invalid={inlineError('clientPhone') ? 'true' : undefined}
                      aria-describedby={inlineError('clientPhone') ? 'clientPhone-error' : undefined}
                      onChange={(e) => {
                        updateField('clientPhone')(e);
                        setBlurErrors((b) => ({ ...b, clientPhone: null }));
                        if (invalidField === 'clientPhone') setInvalidField(null);
                      }}
                      onBlur={(e) => blurValidate('clientPhone', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <label htmlFor="notes">Message (optionnel)</label>
                  <textarea id="notes" rows={3} maxLength={500} placeholder="Précisions sur votre demande…" value={form.notes} onChange={updateField('notes')} />
                </div>

                {account?.canApplyReferral && (
                  <div className="form-row">
                    <ReferralCodeForm compact onApplied={() => loadAccount()} />
                  </div>
                )}
                {!account && getStoredReferral() && (
                  <p className="form-hint referral-remembered">
                    Code de parrainage <strong>{getStoredReferral()}</strong> mémorisé : il sera proposé quand vous créerez votre compte
                    (+10 points après votre premier rendez-vous terminé).
                  </p>
                )}

                <div className="form-row">
                  <label htmlFor="promo-code">Code promo (optionnel)</label>
                  <div className="promo-code-row">
                    <input
                      type="text"
                      id="promo-code"
                      placeholder="Ex : BIENVENUE10"
                      value={promoCodeInput}
                      onChange={(e) => {
                        setPromoCodeInput(e.target.value);
                        setPromoCodeState('idle');
                        setAppliedPromoCode(null);
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={!promoCodeInput.trim() || promoCodeState === 'loading'}
                      onClick={applyPromoCode}
                    >
                      {promoCodeState === 'loading' ? 'Vérification…' : 'Appliquer'}
                    </button>
                  </div>
                  <p className="form-hint">Un seul code promo par réservation (cumulable avec un tarif spécial).</p>
                  {promoCodeState === 'valid' && (
                    <p className="form-feedback success">Code appliqué : {appliedPromoCode.label} ({appliedPromoCode.discount_cents ? `-${formatPrice(appliedPromoCode.discount_cents)}` : `-${appliedPromoCode.discount_percent}%`})</p>
                  )}
                </div>

                {discountCents > 0 && (
                  <p className="form-hint">
                    Réduction appliquée : -{formatPrice(discountCents)} — total après réduction : {formatPrice(finalPrice)}
                  </p>
                )}

                <div className="honeypot" aria-hidden="true">
                  <label htmlFor="website">Ne pas remplir ce champ</label>
                  <input type="text" id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={updateField('website')} />
                </div>
              </>
            )}

            {feedback && feedback.type !== 'error' && (
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

            <div className="booking-step-actions" ref={stepActionsRef}>
              {step > 1 && (
                <button type="button" className="btn btn-outline" onClick={goBack}>
                  ← Précédent
                </button>
              )}
              {step < 4 && (
                <button type="button" className="btn btn-primary" onClick={goNext}>
                  Suivant →
                </button>
              )}
              {step === 4 && (
                <button type="submit" className="btn btn-primary form-actions">
                  Vérifier et confirmer ma demande
                </button>
              )}
            </div>
            <BookingSummary recapGuests={recapGuests} totalDuration={totalDuration} totalPrice={finalPrice} />
          </form>
        </div>
      </section>

      {showAccountModal && (
        <div className="modal-overlay" onClick={() => setShowAccountModal(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-label="Connexion ou création de compte" onClick={(e) => e.stopPropagation()}>
            <AccountAuthForms
              onLoggedIn={() => {
                setShowAccountModal(false);
                loadAccount({ prefill: true });
              }}
            />
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-outline" onClick={() => setShowAccountModal(false)}>Continuer sans compte</button>
            </div>
          </div>
        </div>
      )}

      {showAddonNudge && (
        <div className="modal-overlay" onClick={reviewAddons}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-label="Suppléments disponibles" onClick={(e) => e.stopPropagation()}>
            <h2>Ajouter un supplément ?</h2>
            <p>
              {addonNudgeTargets.map((t, i) => (
                <span key={i}>
                  {addonNudgeTargets.length > 1 && <strong>{t.name} — </strong>}
                  {t.addons.map((a) => a.name).join(', ')}
                  {i < addonNudgeTargets.length - 1 ? <br /> : null}
                </span>
              ))}
              {' '}sont disponibles pour {addonNudgeTargets.length > 1 ? 'ces prestations' : 'cette prestation'}. Vous pouvez continuer sans, ou y jeter un œil.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={reviewAddons}>Voir les suppléments</button>
              <button type="button" className="btn btn-primary" onClick={confirmSkipAddons}>Continuer sans supplément</button>
            </div>
          </div>
        </div>
      )}

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
                <dd>
                  {formatDuration(totalDuration)} — {formatPrice(finalPrice)}
                  {discountCents > 0 && (
                    <>
                      <br />
                      <span className="recap-note">
                        {formatPrice(totalPrice)} - {formatPrice(discountCents)} de réduction
                        {pricedGuests.length > 1
                          ? ' (' +
                            pricedGuests
                              .filter((g) => g.discountCents > 0)
                              .map((g) => `${g.name || 'vous'}${g.discountLabel ? ` : ${g.discountLabel}` : ''}`)
                              .join(', ') +
                            ')'
                          : pricedGuests[0]?.discountLabel
                            ? ` (${pricedGuests[0].discountLabel})`
                            : ''}
                      </span>
                    </>
                  )}
                  {atClientHome && travelFeeCents > 0 && (
                    <>
                      <br />
                      <span className="recap-note">dont {formatPrice(travelFeeCents)} de frais de déplacement</span>
                    </>
                  )}
                </dd>
              </div>
              {stripeEnabled && (
                <div>
                  <dt>Paiement</dt>
                  <dd>
                    <label className="recap-payment-option">
                      <input
                        type="radio"
                        name="paymentOption"
                        value="full"
                        checked={paymentOption === 'full'}
                        onChange={() => setPaymentOption('full')}
                      />
                      Payer en ligne maintenant ({formatPrice(finalPrice)})
                    </label>
                    <label className="recap-payment-option">
                      <input
                        type="radio"
                        name="paymentOption"
                        value="on_site"
                        checked={paymentOption === 'on_site'}
                        onChange={() => setPaymentOption('on_site')}
                      />
                      Payer sur place
                    </label>
                  </dd>
                </div>
              )}
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
      {redirecting && (
        <div className="redirect-screen" role="status" aria-live="polite">
          <div className="redirect-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          <h2>Redirection vers le paiement sécurisé…</h2>
          <p>Vous reviendrez automatiquement sur la page de suivi de votre rendez-vous. Ne fermez pas cette page.</p>
          <div className="redirect-bar" aria-hidden="true"><span /></div>
          <p className="redirect-note">Paiement opéré par Stripe — Carla Création ne voit jamais votre carte.</p>
        </div>
      )}
    </>
  );
}
