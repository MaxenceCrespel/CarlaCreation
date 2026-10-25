import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useSiteConfig } from '../context/SiteConfigContext';
import { useToast } from '../context/ToastContext';
import { useSeo } from '../hooks/useSeo';
import GalleryGrid from '../components/GalleryGrid';
import ReviewsCarousel from '../components/ReviewsCarousel';

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
        text: 'Merci pour votre avis ! Il sera visible après validation.',
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
        <label htmlFor="reviewName">Votre prénom</label>
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
  const { siteTagline, travelFreeRadiusKm, googleReviewUrl } = useSiteConfig();
  useSeo({
    description:
      'Carla Création, coiffeuse et prothésiste ongulaire à Loos, près de Lille (Hauts-de-France), en studio ou à domicile : coupe, coloration, balayage, pose d\'ongles, semi-permanent, manucure et nail art. Réservez votre rendez-vous en ligne 24h/24.',
    path: '/',
  });
  const [gallery, setGallery] = useState([]);
  const [galleryError, setGalleryError] = useState(false);
  const [reviewSummary, setReviewSummary] = useState(null);
  const [reviewError, setReviewError] = useState(false);
  const [offers, setOffers] = useState([]); // [{ id, name, fromCents }]

  useEffect(() => {
    apiFetch('/gallery')
      .then((items) => setGallery(items.slice(0, 6)))
      .catch(() => setGalleryError(true));
  }, []);

  useEffect(() => {
    Promise.all([apiFetch('/services'), apiFetch('/service-categories')])
      .then(([services, categories]) => {
        const roots = categories.filter((c) => c.parent_id === null).sort((a, b) => a.sort_order - b.sort_order);
        const childToRoot = new Map(categories.map((c) => [c.id, c.parent_id ?? c.id]));
        setOffers(
          roots
            .map((root) => {
              const prices = services.filter((s) => childToRoot.get(s.category_id) === root.id).map((s) => s.price_cents);
              return { id: root.id, name: root.name, fromCents: prices.length ? Math.min(...prices) : null };
            })
            .filter((o) => o.fromCents !== null),
        );
      })
      .catch(() => {
        // Optional section: stays hidden if the catalogue can't load.
      });
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
          <p className="eyebrow">Coiffeuse &amp; prothésiste ongulaire à Loos, près de Lille</p>
          <h1>{siteTagline}</h1>
          <p className="hero-lead">
            Coupe, coloration, balayage, manucure et nail art sur-mesure dans un cadre chaleureux.
            Réservez votre créneau en ligne, sans appel, en moins d'une minute.
          </p>
          <div className="hero-actions">
            <Link to="/booking" className="btn btn-primary">Réserver un créneau</Link>
            <Link to="/gallery" className="btn btn-outline">Voir mes réalisations</Link>
          </div>
          <ul className="trust-list">
            <li>Paiement en ligne sécurisé ou sur place</li>
            {Number.isFinite(travelFreeRadiusKm) && <li>Déplacement offert jusqu'à {travelFreeRadiusKm} km</li>}
            <li>Réservation et annulation en ligne</li>
            {reviewSummary?.count > 0 && <li>{reviewSummary.average}/5 · {reviewSummary.count} avis</li>}
          </ul>
        </div>
      </section>

      {offers.length > 0 && (
        <section className="section section-tight">
          <div className="container">
            <p className="eyebrow">Prestations</p>
            <h2>{offers.length === 2 ? 'Deux savoir-faire' : 'Nos savoir-faire'}</h2>
            <div className="offer-grid">
              {offers.map((o) => (
                <Link key={o.id} to="/services" className="offer-card">
                  <span className="offer-card-head">
                    <span className="offer-card-title">{o.name}</span>
                    <span className="offer-card-arrow" aria-hidden="true">→</span>
                  </span>
                  <span className="offer-card-price">À partir de {Math.round(o.fromCents / 100)} €</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

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
            <p>
              Coiffeuse à domicile à Loos, Lille, Ronchin, Wattignies, Seclin, Tourcoing et dans toute la métropole
              lilloise : coupes femme avec balayage, colorations, chignons et coiffures de mariage.
            </p>
            <ul className="checklist">
              <li>Produits professionnels et soins de qualité</li>
              <li>Conseils personnalisés selon vos envies</li>
              <li>Rendez-vous sur place ou à domicile, selon votre préférence</li>
              <li>Réservation en ligne sécurisée, disponible 24h/24</li>
            </ul>
            <Link to="/services" className="btn btn-outline">Découvrir mes prestations</Link>{' '}
            <Link to="/a-propos" className="btn btn-outline">En savoir plus sur Carla</Link>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <p className="eyebrow center">Mes réalisations</p>
          <h2 className="center">Un aperçu de mon travail</h2>
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
          <h2 className="center">Ce qu'en pensent mes client·e·s</h2>
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
            <ReviewsCarousel reviews={reviewSummary.reviews} />
          )}

          {googleReviewUrl && (
            <p className="center" style={{ marginTop: 24 }}>
              <a href={googleReviewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
                Laisser un avis sur Google
              </a>
            </p>
          )}

          <div className="testimonials-cta">
            <ReviewForm />
          </div>

          <p className="center" style={{ marginTop: 40 }}>
            <Link to="/booking" className="btn btn-primary">Prendre rendez-vous</Link>
          </p>
        </div>
      </section>

      <section className="section section-tight">
        <div className="container">
          <div className="card how-card">
            <h2>Comment ça se passe</h2>
            <ol className="how-list">
              <li>
                <strong>Vous réservez en ligne</strong>
                <span>Prestation, lieu, créneau : le prix total s'affiche en direct.</span>
              </li>
              <li>
                <strong>Vous payez comme vous voulez</strong>
                <span>En ligne par carte, ou sur place le jour du rendez-vous.</span>
              </li>
              <li>
                <strong>Vous suivez votre rendez-vous</strong>
                <span>Un lien par email pour le consulter ou l'annuler.</span>
              </li>
            </ol>
          </div>
        </div>
      </section>
    </>
  );
}
