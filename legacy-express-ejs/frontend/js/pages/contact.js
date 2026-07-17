import { apiFetch } from '../modules/api.js';
import { showToast } from '../modules/toast.js';

const form = document.getElementById('contact-form');
const feedback = document.getElementById('contact-feedback');

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    feedback.textContent = '';
    feedback.className = 'form-feedback';

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      message: form.message.value.trim(),
      website: form.website.value,
    };

    try {
      await apiFetch('/contact', { method: 'POST', body: payload });
      feedback.textContent = 'Message envoyé, merci ! Nous vous répondrons rapidement.';
      feedback.classList.add('success');
      showToast('Message envoyé !', 'success');
      form.reset();
    } catch (err) {
      feedback.textContent = err.message;
      feedback.classList.add('error');
      showToast(err.message, 'error');
    }
  });
}
