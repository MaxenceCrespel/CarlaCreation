import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useSeo } from '../hooks/useSeo';
import { formatDuration, formatPrice } from '../utils/format';

function ServiceCard({ service }) {
  return (
    <article className="service-card">
      <h3>{service.name}</h3>
      <p>{service.description}</p>
      <div className="service-meta">
        <span className="service-price">{formatPrice(service.price_cents)}</span>
        <span className="service-duration">{formatDuration(service.duration_minutes)}</span>
      </div>
    </article>
  );
}

const FAQ_ITEMS = [
  {
    q: 'Puis-je annuler ou modifier mon rendez-vous ?',
    a: "Oui, contactez-nous par téléphone ou email au moins 24h à l'avance pour annuler ou déplacer votre créneau.",
  },
  {
    q: 'Dois-je créer un compte pour réserver ?',
    a: 'Non, la réservation en ligne ne nécessite aucun compte : renseignez simplement vos coordonnées.',
  },
  {
    q: 'Comment est confirmée ma réservation ?',
    a: 'Votre demande est transmise instantanément au studio. Vous serez contacté·e pour confirmation si nécessaire.',
  },
  {
    q: 'Le studio est-il accessible aux personnes à mobilité réduite ?',
    a: 'Oui, notre studio est entièrement accessible PMR, avec un accès de plain-pied.',
  },
];

export default function Services() {
  useSeo({
    title: 'Prestations coiffure & ongles à Lille',
    description:
      'Tous nos tarifs et durées à Lille : coupe, coloration, balayage, brushing, manucure, pose semi-permanent et nail art.',
    path: '/services',
  });
  const [services, setServices] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch('/services')
      .then(setServices)
      .catch(() => setError(true));
  }, []);

  const coiffure = services?.filter((s) => s.category === 'coiffure') ?? [];
  const ongles = services?.filter((s) => s.category === 'ongles') ?? [];

  return (
    <>
      <section className="section page-hero">
        <div className="container">
          <p className="eyebrow center">Nos prestations</p>
          <h1 className="center">Des soins pour chaque style</h1>
          <p className="section-lead center">
            Tarifs indicatifs — un devis précis pourra être établi lors de votre diagnostic en studio.
          </p>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <h2 className="category-title">Coiffure</h2>
          <div className="services-grid">
            {error && <p className="loading-text">Impossible de charger les prestations pour le moment.</p>}
            {!error && !services && <p className="loading-text">Chargement des prestations…</p>}
            {!error && services && coiffure.map((s) => <ServiceCard key={s.id} service={s} />)}
          </div>

          <h2 className="category-title" style={{ marginTop: 56 }}>Ongles</h2>
          <div className="services-grid">
            {!error && !services && <p className="loading-text">Chargement des prestations…</p>}
            {!error && services && ongles.map((s) => <ServiceCard key={s.id} service={s} />)}
          </div>

          <p className="center" style={{ marginTop: 48 }}>
            <Link to="/booking" className="btn btn-primary">Réserver une prestation</Link>
          </p>
        </div>
      </section>

      <section className="section" id="faq">
        <div className="container">
          <p className="eyebrow center">Questions fréquentes</p>
          <h2 className="center">Besoin d'informations ?</h2>
          <div className="faq-list">
            {FAQ_ITEMS.map((item) => (
              <details className="faq-item" key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
