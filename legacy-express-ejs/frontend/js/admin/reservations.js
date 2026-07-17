import { apiFetch } from '../modules/api.js';
import { escapeHtml } from '../modules/format.js';
import { showToast } from '../modules/toast.js';

const STATUS_LABELS = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  completed: 'Terminée',
  cancelled: 'Annulée',
};

let allReservations = [];
let tbody;
let statusFilter;

function renderReservations() {
  const filter = statusFilter.value;
  const rows = allReservations.filter((r) => filter === 'all' || r.status === filter);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8">Aucune réservation trouvée.</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map((r) => {
      const statusOptions = Object.entries(STATUS_LABELS)
        .map(([value, label]) => `<option value="${value}" ${value === r.status ? 'selected' : ''}>${label}</option>`)
        .join('');

      return `
      <tr data-id="${r.id}">
        <td>${escapeHtml(r.reservation_date)}</td>
        <td>${escapeHtml(r.start_time)} – ${escapeHtml(r.end_time)}</td>
        <td>${escapeHtml(r.service_name)}</td>
        <td>${escapeHtml(r.client_name)}</td>
        <td>${escapeHtml(r.client_email)}<br>${escapeHtml(r.client_phone)}</td>
        <td>${escapeHtml(r.notes) || '—'}</td>
        <td>
          <span class="status-badge status-${r.status}">${STATUS_LABELS[r.status] || r.status}</span>
          <select class="status-select" data-id="${r.id}">${statusOptions}</select>
        </td>
        <td class="row-actions">
          <button type="button" class="delete-btn danger" data-id="${r.id}">Supprimer</button>
        </td>
      </tr>`;
    })
    .join('');

  tbody.querySelectorAll('.status-select').forEach((select) => {
    select.addEventListener('change', async () => {
      const id = select.dataset.id;
      const status = select.value;
      try {
        await apiFetch(`/reservations/${id}/status`, { method: 'PATCH', body: { status } });
        const res = allReservations.find((r) => String(r.id) === String(id));
        if (res) res.status = status;
        renderReservations();
        showToast('Statut mis à jour.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  tbody.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!confirm('Supprimer définitivement cette réservation ?')) return;
      try {
        await apiFetch(`/reservations/${id}`, { method: 'DELETE' });
        allReservations = allReservations.filter((r) => String(r.id) !== String(id));
        renderReservations();
        showToast('Réservation supprimée.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

export async function loadReservations() {
  tbody.innerHTML = '<tr><td colspan="8">Chargement…</td></tr>';
  try {
    allReservations = await apiFetch('/reservations');
    renderReservations();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8">Erreur : ${escapeHtml(err.message)}</td></tr>`;
  }
}

export function initReservationsTab() {
  tbody = document.getElementById('reservations-body');
  statusFilter = document.getElementById('status-filter');
  statusFilter.addEventListener('change', renderReservations);
}
