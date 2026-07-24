import { useState } from 'react';
import { apiFetch } from '../api/client';
import { useSiteConfig } from '../context/SiteConfigContext';
import { useToast } from '../context/ToastContext';
import { useSeo } from '../hooks/useSeo';
import { getSavedContact, saveContact } from '../utils/contactStorage';

export default function Contact() {
  const { sitePhone, sitePhoneHref, siteEmail } = useSiteConfig();
  useSeo({
    title: 'Contact — Studio à Lille',
    description: 'Téléphone, email et formulaire de contact de mon studio coiffure et ongles à Lille (Hauts-de-France).',
    path: '/contact',
  });
  const showToast = useToast();

  // Pre-fill from a previous visit/booking so returning clients don't have
  // to retype their name and email here either.
  const [form, setForm] = useState(() => {
    const saved = getSavedContact();
    return { name: saved?.clientName || '', email: saved?.clientEmail || '', message: '', website: '' };
  });
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);

    if (!e.target.checkValidity()) {
      e.target.reportValidity();
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/contact', { method: 'POST', body: form });
      setFeedback({ type: 'success', text: 'Message envoyé, merci ! Je vous répondrai rapidement.' });
      showToast('Message envoyé !', 'success');
      saveContact({ clientName: form.name, clientEmail: form.email, clientPhone: getSavedContact()?.clientPhone || '' });
      setForm((f) => ({ ...f, message: '', website: '' }));
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="section page-hero">
        <div className="container">
          <p className="eyebrow center">Contact</p>
          <h1 className="center">Venez me rencontrer</h1>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container contact-grid">
          <div className="contact-info">
            <ul className="contact-list">
              <li><strong>Téléphone</strong><span><a href={`tel:${sitePhoneHref}`}>{sitePhone}</a></span></li>
              <li><strong>Email</strong><span><a href={`mailto:${siteEmail}`}>{siteEmail}</a></span></li>
            </ul>
          </div>

          <form className="card contact-form" noValidate onSubmit={handleSubmit}>
            <h3>Une question ?</h3>
            <div className="form-row">
              <label htmlFor="contactName">Nom</label>
              <input type="text" id="contactName" required minLength={2} maxLength={100} value={form.name} onChange={update('name')} />
            </div>
            <div className="form-row">
              <label htmlFor="contactEmail">Email</label>
              <input type="email" id="contactEmail" required value={form.email} onChange={update('email')} />
            </div>
            <div className="form-row">
              <label htmlFor="contactMessage">Message</label>
              <textarea id="contactMessage" rows={4} required minLength={5} maxLength={2000} value={form.message} onChange={update('message')} />
            </div>
            <div className="honeypot" aria-hidden="true">
              <label htmlFor="contactWebsite">Ne pas remplir ce champ</label>
              <input type="text" id="contactWebsite" tabIndex={-1} autoComplete="off" value={form.website} onChange={update('website')} />
            </div>
            {feedback && (
              <div className={`form-feedback ${feedback.type}`} role="status" aria-live="polite">
                {feedback.text}
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-block form-actions" disabled={submitting}>
              {submitting ? 'Envoi en cours…' : 'Envoyer le message'}
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
