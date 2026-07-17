import { apiFetch } from '../modules/api.js';
import { escapeHtml } from '../modules/format.js';
import { showToast } from '../modules/toast.js';

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

let rowsContainer;
let blackoutList;
let blackoutForm;
let blackoutFeedback;

function renderHoursRow(h) {
  const row = document.createElement('div');
  row.className = 'hours-row';
  row.dataset.day = h.day_of_week;
  row.innerHTML = `
    <span class="hours-row-day">${DAY_NAMES[h.day_of_week]}</span>
    <label class="hours-row-closed">
      <input type="checkbox" class="closed-checkbox" ${h.is_closed ? 'checked' : ''} />
      Fermé
    </label>
    <input type="time" class="open-time" value="${h.open_time || '09:00'}" ${h.is_closed ? 'disabled' : ''} />
    <span>–</span>
    <input type="time" class="close-time" value="${h.close_time || '19:00'}" ${h.is_closed ? 'disabled' : ''} />
    <button type="button" class="btn btn-outline save-hours-btn">Enregistrer</button>
    <span class="hours-row-feedback"></span>
  `;

  const closedCheckbox = row.querySelector('.closed-checkbox');
  const openTime = row.querySelector('.open-time');
  const closeTime = row.querySelector('.close-time');
  const feedback = row.querySelector('.hours-row-feedback');

  closedCheckbox.addEventListener('change', () => {
    openTime.disabled = closedCheckbox.checked;
    closeTime.disabled = closedCheckbox.checked;
  });

  row.querySelector('.save-hours-btn').addEventListener('click', async () => {
    feedback.textContent = '';
    try {
      await apiFetch(`/admin/settings/opening-hours/${h.day_of_week}`, {
        method: 'PUT',
        body: {
          isClosed: closedCheckbox.checked,
          openTime: closedCheckbox.checked ? null : openTime.value,
          closeTime: closedCheckbox.checked ? null : closeTime.value,
        },
      });
      feedback.textContent = 'Enregistré ✓';
      showToast(`Horaires du ${DAY_NAMES[h.day_of_week].toLowerCase()} mis à jour.`, 'success');
    } catch (err) {
      feedback.textContent = err.message;
      showToast(err.message, 'error');
    }
  });

  return row;
}

async function loadHours() {
  rowsContainer.innerHTML = '';
  try {
    const hours = await apiFetch('/admin/settings/opening-hours');
    hours.forEach((h) => rowsContainer.appendChild(renderHoursRow(h)));
  } catch (err) {
    rowsContainer.innerHTML = `<p class="loading-text">Erreur : ${escapeHtml(err.message)}</p>`;
  }
}

function renderBlackoutList(dates) {
  if (!dates.length) {
    blackoutList.innerHTML = '<li class="blackout-empty">Aucune fermeture exceptionnelle à venir.</li>';
    return;
  }
  blackoutList.innerHTML = dates
    .map(
      (d) => `
    <li data-date="${d.date}">
      <span><strong>${escapeHtml(d.date)}</strong>${d.reason ? ` — ${escapeHtml(d.reason)}` : ''}</span>
      <button type="button" class="delete-blackout-btn danger">Retirer</button>
    </li>`
    )
    .join('');

  blackoutList.querySelectorAll('.delete-blackout-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const date = btn.closest('li').dataset.date;
      try {
        await apiFetch(`/admin/settings/blackout-dates/${date}`, { method: 'DELETE' });
        showToast('Fermeture retirée.', 'success');
        await loadBlackoutDates();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

async function loadBlackoutDates() {
  try {
    const dates = await apiFetch('/admin/settings/blackout-dates');
    renderBlackoutList(dates);
  } catch (err) {
    blackoutList.innerHTML = `<li class="blackout-empty">Erreur : ${escapeHtml(err.message)}</li>`;
  }
}

export async function loadHoursTab() {
  await Promise.all([loadHours(), loadBlackoutDates()]);
}

export function initHoursTab() {
  rowsContainer = document.getElementById('hours-editor-rows');
  blackoutList = document.getElementById('blackout-list');
  blackoutForm = document.getElementById('blackout-form');
  blackoutFeedback = document.getElementById('blackout-feedback');

  blackoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    blackoutFeedback.textContent = '';
    blackoutFeedback.className = 'form-feedback';

    const date = blackoutForm.date.value;
    const reason = blackoutForm.reason.value.trim();

    try {
      await apiFetch('/admin/settings/blackout-dates', { method: 'POST', body: { date, reason } });
      blackoutForm.reset();
      showToast('Fermeture ajoutée.', 'success');
      await loadBlackoutDates();
    } catch (err) {
      blackoutFeedback.textContent = err.message;
      blackoutFeedback.classList.add('error');
      showToast(err.message, 'error');
    }
  });
}
