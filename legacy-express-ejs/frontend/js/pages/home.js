import { apiFetch } from '../modules/api.js';
import { renderGalleryGrid } from '../modules/gallery-view.js';

async function loadGalleryPreview() {
  const container = document.getElementById('gallery-preview');
  if (!container) return;
  try {
    const items = await apiFetch('/gallery');
    renderGalleryGrid(container, items.slice(0, 6));
  } catch (err) {
    container.innerHTML = '<p class="loading-text">Impossible de charger la galerie pour le moment.</p>';
  }
}

loadGalleryPreview();
