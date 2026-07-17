import { escapeHtml } from './format.js';

function openLightbox(src, alt) {
  let lightbox = document.querySelector('.lightbox');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.innerHTML = `
      <button class="lightbox-close" aria-label="Fermer">&times;</button>
      <img src="" alt="" />
    `;
    document.body.appendChild(lightbox);
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.classList.contains('lightbox-close')) {
        lightbox.classList.remove('is-open');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') lightbox.classList.remove('is-open');
    });
  }
  lightbox.querySelector('img').src = src;
  lightbox.querySelector('img').alt = alt;
  lightbox.classList.add('is-open');
}

// Renders a list of { url, alt_text } gallery items into a container as a
// clickable grid that opens a lightbox. Shared by the home preview and the
// full gallery page so both stay visually consistent.
export function renderGalleryGrid(container, items) {
  if (!items.length) {
    container.innerHTML = '<p class="loading-text">Aucune photo pour le moment.</p>';
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
    <button type="button" class="gallery-item" data-full="/${encodeURI(item.url)}" data-alt="${escapeHtml(item.alt_text)}" aria-label="Agrandir : ${escapeHtml(item.alt_text)}">
      <img src="/${encodeURI(item.url)}" alt="${escapeHtml(item.alt_text)}" loading="lazy" />
    </button>`
    )
    .join('');

  container.querySelectorAll('.gallery-item').forEach((btn) => {
    btn.addEventListener('click', () => openLightbox(btn.dataset.full, btn.dataset.alt));
  });
}
