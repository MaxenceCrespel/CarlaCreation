import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useSeo } from '../hooks/useSeo';
import { formatDuration, formatPrice } from '../utils/format';

// Flattens the (max one level deep) category tree into a single ordered
// list — each top-level category immediately followed by its
// subcategories — so this page can render them as nested sections.
function orderedCategoryTree(categories) {
  const topLevel = categories.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const result = [];
  for (const top of topLevel) {
    result.push({ ...top, depth: 0 });
    categories
      .filter((c) => c.parent_id === top.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((child) => result.push({ ...child, depth: 1 }));
  }
  return result;
}

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
    a: 'Oui : chaque email de confirmation contient un lien "Voir ou annuler mon rendez-vous", sans avoir besoin de créer de compte. Pour un changement de créneau, annulez puis reprenez rendez-vous à un autre horaire.',
  },
  {
    q: 'Dois-je créer un compte pour réserver ?',
    a: 'Non, la réservation en ligne ne nécessite aucun compte : renseignez simplement vos coordonnées.',
  },
  {
    q: 'Comment est confirmée ma réservation ?',
    a: "Vous recevez un email dès l'envoi de votre demande, puis un second dès qu'elle est confirmée (ou refusée) par le studio, ainsi qu'un rappel automatique la veille de votre rendez-vous.",
  },
  {
    q: 'Le rendez-vous a-t-il obligatoirement lieu au studio ?',
    a: "Non : lors de la réservation, choisissez si vous venez sur place ou si vous préférez que ce soit Carla qui se déplace chez vous (une adresse vous sera alors demandée).",
  },
];

export default function Services() {
  useSeo({
    title: 'Prestations coiffure & ongles à Lille',
    description:
      'Tous mes tarifs et durées à Lille : coupe, coloration, balayage, brushing, manucure, pose semi-permanent et nail art.',
    path: '/services',
  });
  const [services, setServices] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch('/services')
      .then(setServices)
      .catch(() => setError(true));
    apiFetch('/service-categories')
      .then(setCategories)
      .catch(() => {});
  }, []);

  return (
    <>
      <section className="section page-hero">
        <div className="container">
          <p className="eyebrow center">Mes prestations</p>
          <h1 className="center">Des soins pour chaque style</h1>
          <p className="section-lead center">
            Tarifs indicatifs — un devis précis pourra être établi lors de votre diagnostic en studio.
          </p>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          {error && <p className="loading-text">Impossible de charger les prestations pour le moment.</p>}
          {!error && !services && <p className="loading-text">Chargement des prestations…</p>}

          {!error && services && orderedCategoryTree(categories).map((cat, i) => (
            <div key={cat.id}>
              <h2
                className={`category-title ${cat.depth > 0 ? 'category-title-sub' : ''}`}
                style={{ marginTop: i === 0 ? 0 : cat.depth > 0 ? 32 : 56 }}
              >
                {cat.name}
              </h2>
              <div className="services-grid">
                {services.filter((s) => s.category_id === cat.id).map((s) => <ServiceCard key={s.id} service={s} />)}
              </div>
            </div>
          ))}

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
