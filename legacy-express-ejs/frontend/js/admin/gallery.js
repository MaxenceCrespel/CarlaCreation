import { apiFetch, apiUpload } from '../modules/api.js';
import { escapeHtml } from '../modules/format.js';
import { showToast } from '../modules/toast.js';

let items = [];
let grid;

function render() {
  if (!items.length) {
    grid.innerHTML = '<p class="loading-text">Aucune photo pour le moment. Ajoutez-en une ci-dessus.</p>';
    return;
  }

  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);

  grid.innerHTML = sorted
    .map(
      (item, i) => `
    <div class="admin-gallery-card" data-id="${item.id}">
      <img src="/${encodeURI(item.url)}" alt="${escapeHtml(item.alt_text)}" loading="lazy" />
      <div class="admin-gallery-card-body">
        <input type="text" class="alt-input" value="${escapeHtml(item.alt_text)}" maxlength="150" aria-label="Légende" />
        <div class="admin-gallery-card-actions">
          <button type="button" class="move-up" ${i === 0 ? 'disabled' : ''} aria-label="Monter">&uarr;</button>
          <button type="button" class="move-down" ${i === sorted.length - 1 ? 'disabled' : ''} aria-label="Descendre">&darr;</button>
          <button type="button" class="save-btn">Enregistrer</button>
          <button type="button" class="delete-btn danger">Supprimer</button>
        </div>
      </div>
    </div>`
    )
    .join('');

  grid.querySelectorAll('.admin-gallery-card').forEach((card) => {
    const id = card.dataset.id;

    card.querySelector('.save-btn').addEventListener('click', async () => {
      const altText = card.querySelector('.alt-input').value.trim();
      try {
        await apiFetch(`/admin/gallery/${id}`, { method: 'PATCH', body: { altText } });
        const item = items.find((i2) => String(i2.id) === id);
        if (item) item.alt_text = altText;
        showToast('Légende mise à jour.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    card.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm('Supprimer définitivement cette photo ?')) return;
      try {
        await apiFetch(`/admin/gallery/${id}`, { method: 'DELETE' });
        items = items.filter((i2) => String(i2.id) !== id);
        render();
        showToast('Photo supprimée.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    const upBtn = card.querySelector('.move-up');
    const downBtn = card.querySelector('.move-down');
    if (upBtn) upBtn.addEventListener('click', () => swapOrder(id, -1));
    if (downBtn) downBtn.addEventListener('click', () => swapOrder(id, 1));
  });
}

async function swapOrder(id, direction) {
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
  const index = sorted.findIndex((i2) => String(i2.id) === id);
  const swapIndex = index + direction;
  if (swapIndex < 0 || swapIndex >= sorted.length) return;

  const a = sorted[index];
  const b = sorted[swapIndex];
  const aOrder = a.sort_order;
  const bOrder = b.sort_order;

  try {
    await Promise.all([
      apiFetch(`/admin/gallery/${a.id}`, { method: 'PATCH', body: { sortOrder: bOrder } }),
      apiFetch(`/admin/gallery/${b.id}`, { method: 'PATCH', body: { sortOrder: aOrder } }),
    ]);
    a.sort_order = bOrder;
    b.sort_order = aOrder;
    render();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

export async function loadGallery() {
  grid.innerHTML = '<p class="loading-text">Chargement…</p>';
  try {
    items = await apiFetch('/admin/gallery');
    render();
  } catch (err) {
    grid.innerHTML = `<p class="loading-text">Erreur : ${escapeHtml(err.message)}</p>`;
  }
}

export function initGalleryTab() {
  grid = document.getElementById('admin-gallery-grid');

  const form = document.getElementById('upload-form');
  const feedback = document.getElementById('upload-feedback');
  const submitBtn = document.getElementById('upload-submit');
  const fileInput = document.getElementById('photo-file');
  const altInput = document.getElementById('photo-alt');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    feedback.textContent = '';
    feedback.className = 'form-feedback';

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const formData = new FormData();
    formData.append('photo', fileInput.files[0]);
    formData.append('altText', altInput.value.trim());

    submitBtn.disabled = true;
    submitBtn.textContent = 'Envoi en cours…';

    try {
      const created = await apiUpload('/admin/gallery', formData);
      items.push(created);
      render();
      form.reset();
      feedback.textContent = 'Photo ajoutée avec succès.';
      feedback.classList.add('success');
      showToast('Photo ajoutée.', 'success');
    } catch (err) {
      feedback.textContent = err.message;
      feedback.classList.add('error');
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Téléverser la photo';
    }
  });
}
