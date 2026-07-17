import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useSiteConfig } from '../context/SiteConfigContext';
import { useToast } from '../context/ToastContext';
import { useSeo } from '../hooks/useSeo';
import GalleryGrid from '../components/GalleryGrid';

function Stars({ value, size }) {
  return (
    <span className={`stars ${size === 'lg' ? 'stars-lg' : ''}`} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? 'star is-filled' : 'star'}>★</span>
      ))}
    </span>
  );
}

function StarRatingInput({ value, onChange }) {
  return (
    <div className="star-input" role="radiogroup" aria-label="Note">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
          className={n <= value ? 'star-btn is-filled' : 'star-btn'}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function ReviewForm() {
  const showToast = useToast();
  const [form, setForm] = useState({ clientName: '', rating: 5, comment: '', website: '' });
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
      await apiFetch('/reviews', { method: 'POST', body: form });
      setFeedback({
        type: 'success',
        text: "Merci pour votre avis ! Il sera visible après validation par l'équipe.",
      });
      showToast('Avis envoyé, merci !', 'success');
      setForm({ clientName: '', rating: 5, comment: '', website: '' });
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card review-form" noValidate onSubmit={handleSubmit}>
      <h3>Laisser un avis</h3>
      <div className="form-row">
        <label htmlFor="reviewName">Nom</label>
        <input type="text" id="reviewName" required minLength={2} maxLength={100} value={form.clientName} onChange={update('clientName')} />
      </div>
      <div className="form-row">
        <label>Note</label>
        <StarRatingInput value={Number(form.rating)} onChange={(n) => setForm((f) => ({ ...f, rating: n }))} />
      </div>
      <div className="form-row">
        <label htmlFor="reviewComment">Votre avis</label>
        <textarea id="reviewComment" rows={4} required minLength={5} maxLength={1000} value={form.comment} onChange={update('comment')} />
      </div>
      <div className="honeypot" aria-hidden="true">
        <label htmlFor="reviewWebsite">Ne pas remplir ce champ</label>
        <input type="text" id="reviewWebsite" tabIndex={-1} autoComplete="off" value={form.website} onChange={update('website')} />
      </div>
      {feedback && (
        <div className={`form-feedback ${feedback.type}`} role="status" aria-live="polite">
          {feedback.text}
        </div>
      )}
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Envoi en cours…' : "Envoyer mon avis"}
      </button>
    </form>
  );
}

export default function Home() {
  const { siteTagline } = useSiteConfig();
  useSeo({
    description:
      'Studio de coiffure et de nail art à Lille (Hauts-de-France) : coupe, coloration, balayage, manucure et pose semi-permanent. Réservez votre rendez-vous en ligne 24h/24.',
    path: '/',
  });
  const [gallery, setGallery] = useState([]);
  const [galleryError, setGalleryError] = useState(false);
  const [reviewSummary, setReviewSummary] = useState(null);
  const [reviewError, setReviewError] = useState(false);

  useEffect(() => {
    apiFetch('/gallery')
      .then((items) => setGallery(items.slice(0, 6)))
      .catch(() => setGalleryError(true));
  }, []);

  useEffect(() => {
    apiFetch('/reviews')
      .then(setReviewSummary)
      .catch(() => setReviewError(true));
  }, []);

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <p className="eyebrow">Nail Studio — Coiffure &amp; Ongles</p>
          <h1>{siteTagline}</h1>
          <p className="hero-lead">
            Coupe, coloration, balayage, manucure et nail art sur-mesure dans un cadre chaleureux.
            Réservez votre créneau en ligne, sans appel, en moins d'une minute.
          </p>
          <div className="hero-actions">
            <Link to="/booking" className="btn btn-primary">Réserver un créneau</Link>
            <Link to="/gallery" className="btn btn-outline">Voir nos réalisations</Link>
          </div>
          <ul className="hero-stats">
            <li><strong>8+</strong><span>ans d'expérience</span></li>
            <li><strong>2500+</strong><span>client·e·s satisfait·e·s</span></li>
            <li>
              <strong>{reviewSummary?.average != null ? `${reviewSummary.average}/5` : '—'}</strong>
              <span>{reviewSummary?.count ? `note moyenne (${reviewSummary.count} avis)` : 'note moyenne'}</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="container about-grid">
          <div className="about-image" aria-hidden="true">
            <img src="/images/placeholder-about.svg" alt="" loading="lazy" width="560" height="640" />
          </div>
          <div className="about-content">
            <p className="eyebrow">À propos du studio</p>
            <h2>Un savoir-faire artisanal, pensé pour vous</h2>
            <p>
              Depuis plus de 8 ans, Carla accompagne ses client·e·s avec des techniques de coupe,
              de coloration et de nail art modernes, dans le respect de la santé du cheveu et de l'ongle.
              Chaque prestation démarre par un diagnostic personnalisé pour un résultat qui vous ressemble.
            </p>
            <ul className="checklist">
              <li>Produits professionnels et soins de qualité</li>
              <li>Conseils personnalisés selon vos envies</li>
              <li>Studio accessible PMR, ambiance calme et conviviale</li>
              <li>Réservation en ligne sécurisée, disponible 24h/24</li>
            </ul>
            <Link to="/services" className="btn btn-outline">Découvrir nos prestations</Link>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <p className="eyebrow center">Nos réalisations</p>
          <h2 className="center">Un aperçu de notre travail</h2>
          <p className="section-lead center">Coupes, colorations, manucures et nail art réalisés en studio.</p>
          {galleryError ? (
            <p className="loading-text">Impossible de charger la galerie pour le moment.</p>
          ) : (
            <GalleryGrid items={gallery} previewClass />
          )}
          <p className="center" style={{ marginTop: 32 }}>
            <Link to="/gallery" className="btn btn-outline">Voir toute la galerie</Link>
          </p>
        </div>
      </section>

      <section className="section" id="testimonials">
        <div className="container">
          <p className="eyebrow center">Avis clients</p>
          <h2 className="center">Ce qu'en pensent nos client·e·s</h2>
          {reviewSummary?.count > 0 && (
            <p className="section-lead center">
              <Stars value={Math.round(reviewSummary.average)} size="lg" /> {reviewSummary.average}/5 sur {reviewSummary.count} avis
            </p>
          )}

          {reviewError && <p className="loading-text">Impossible de charger les avis pour le moment.</p>}

          {!reviewError && reviewSummary && reviewSummary.reviews.length === 0 && (
            <p className="loading-text center">Aucun avis pour le moment. Soyez la première personne à en laisser un !</p>
          )}

          {!reviewError && reviewSummary && reviewSummary.reviews.length > 0 && (
            <div className="testimonials-grid">
              {reviewSummary.reviews.slice(0, 6).map((review) => (
                <blockquote className="testimonial-card" key={review.id}>
                  <Stars value={review.rating} />
                  <p>« {review.comment} »</p>
                  <footer>— {review.clientName}</footer>
                </blockquote>
              ))}
            </div>
          )}

          <div className="testimonials-cta">
            <ReviewForm />
          </div>

          <p className="center" style={{ marginTop: 40 }}>
            <Link to="/booking" className="btn btn-primary">Prendre rendez-vous</Link>
          </p>
        </div>
      </section>
    </>
  );
}
