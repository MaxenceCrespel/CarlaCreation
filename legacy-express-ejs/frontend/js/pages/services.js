import { apiFetch } from '../modules/api.js';
import { escapeHtml, formatPrice, formatDuration } from '../modules/format.js';

function renderCards(container, services) {
  if (!services.length) {
    container.innerHTML = '<p class="loading-text">Aucune prestation disponible pour le moment.</p>';
    return;
  }
  container.innerHTML = services
    .map(
      (s) => `
    <article class="service-card">
      <h3>${escapeHtml(s.name)}</h3>
      <p>${escapeHtml(s.description)}</p>
      <div class="service-meta">
        <span class="service-price">${formatPrice(s.price_cents)}</span>
        <span class="service-duration">${formatDuration(s.duration_minutes)}</span>
      </div>
    </article>`
    )
    .join('');
}

async function loadServices() {
  const coiffureGrid = document.getElementById('services-coiffure');
  const onglesGrid = document.getElementById('services-ongles');
  try {
    const services = await apiFetch('/services');
    renderCards(coiffureGrid, services.filter((s) => s.category === 'coiffure'));
    renderCards(onglesGrid, services.filter((s) => s.category === 'ongles'));
  } catch (err) {
    const message = '<p class="loading-text">Impossible de charger les prestations pour le moment.</p>';
    coiffureGrid.innerHTML = message;
    onglesGrid.innerHTML = message;
  }
}

loadServices();
