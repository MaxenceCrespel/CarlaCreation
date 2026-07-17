import { apiFetch } from '../modules/api.js';
import { showToast } from '../modules/toast.js';
import { formatPrice, formatDuration } from '../modules/format.js';

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

async function loadHours() {
  const list = document.getElementById('hours-list');
  if (!list) return;
  try {
    const { openingHours } = await apiFetch('/hours');
    list.innerHTML = openingHours
      .map((h) => {
        const label = h.is_closed ? 'Fermé' : `${h.open_time} – ${h.close_time}`;
        return `<li><span>${DAY_NAMES[h.day_of_week]}</span><span>${label}</span></li>`;
      })
      .join('');
  } catch (err) {
    list.innerHTML = '<li><span>Horaires indisponibles</span><span></span></li>';
  }
}

function initBookingForm() {
  const form = document.getElementById('booking-form');
  if (!form) return;

  const dateInput = document.getElementById('date');
  const serviceSelect = document.getElementById('service');
  const slotSelect = document.getElementById('slot');
  const feedback = document.getElementById('booking-feedback');
  const submitBtn = document.getElementById('booking-submit');

  const today = new Date();
  dateInput.min = today.toISOString().slice(0, 10);
  const maxDate = new Date(today);
  maxDate.setMonth(maxDate.getMonth() + 3);
  dateInput.max = maxDate.toISOString().slice(0, 10);

  async function loadServiceOptions() {
    try {
      const services = await apiFetch('/services');
      services.forEach((s) => {
        const option = document.createElement('option');
        option.value = s.id;
        const categoryLabel = s.category === 'ongles' ? 'Ongles' : 'Coiffure';
        option.textContent = `[${categoryLabel}] ${s.name} — ${formatPrice(s.price_cents)} (${formatDuration(s.duration_minutes)})`;
        serviceSelect.appendChild(option);
      });
    } catch (err) {
      showToast('Impossible de charger les prestations.', 'error');
    }
  }

  async function refreshSlots() {
    const date = dateInput.value;
    const serviceId = serviceSelect.value;
    slotSelect.innerHTML = '';

    if (!date || !serviceId) {
      slotSelect.disabled = true;
      const opt = document.createElement('option');
      opt.textContent = "Choisissez d'abord une date et une prestation";
      slotSelect.appendChild(opt);
      return;
    }

    const loadingOpt = document.createElement('option');
    loadingOpt.textContent = 'Chargement des créneaux…';
    slotSelect.appendChild(loadingOpt);
    slotSelect.disabled = true;

    try {
      const result = await apiFetch(`/reservations/availability?date=${encodeURIComponent(date)}&serviceId=${encodeURIComponent(serviceId)}`);
      slotSelect.innerHTML = '';
      if (!result.slots.length) {
        const noneOpt = document.createElement('option');
        noneOpt.textContent = 'Aucun créneau disponible ce jour-là';
        slotSelect.appendChild(noneOpt);
        slotSelect.disabled = true;
        return;
      }
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choisissez un créneau';
      placeholder.selected = true;
      placeholder.disabled = true;
      slotSelect.appendChild(placeholder);

      result.slots.forEach((time) => {
        const o = document.createElement('option');
        o.value = time;
        o.textContent = time;
        slotSelect.appendChild(o);
      });
      slotSelect.disabled = false;
    } catch (err) {
      slotSelect.innerHTML = '<option value="">Erreur de chargement</option>';
      slotSelect.disabled = true;
    }
  }

  dateInput.addEventListener('change', refreshSlots);
  serviceSelect.addEventListener('change', refreshSlots);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    feedback.textContent = '';
    feedback.className = 'form-feedback';

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const payload = {
      serviceId: Number(serviceSelect.value),
      date: dateInput.value,
      startTime: slotSelect.value,
      clientName: form.clientName.value.trim(),
      clientEmail: form.clientEmail.value.trim(),
      clientPhone: form.clientPhone.value.trim(),
      notes: form.notes.value.trim(),
      website: form.website.value,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Envoi en cours…';

    try {
      await apiFetch('/reservations', { method: 'POST', body: payload });
      feedback.textContent = 'Votre demande de rendez-vous a bien été envoyée. Vous recevrez une confirmation prochainement.';
      feedback.classList.add('success');
      showToast('Réservation envoyée avec succès !', 'success');
      form.reset();
      slotSelect.innerHTML = '<option value="">Choisissez d\'abord une date et une prestation</option>';
      slotSelect.disabled = true;
    } catch (err) {
      feedback.textContent = err.message;
      feedback.classList.add('error');
      showToast(err.message, 'error');
      await refreshSlots();
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirmer ma demande de rendez-vous';
    }
  });

  loadServiceOptions();
}

loadHours();
initBookingForm();
