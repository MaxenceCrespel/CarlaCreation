import { apiFetch } from '../modules/api.js';
import { renderGalleryGrid } from '../modules/gallery-view.js';

async function loadGallery() {
  const container = document.getElementById('gallery-grid');
  try {
    const items = await apiFetch('/gallery');
    renderGalleryGrid(container, items);
  } catch (err) {
    container.innerHTML = '<p class="loading-text">Impossible de charger la galerie pour le moment.</p>';
  }
}

loadGallery();
