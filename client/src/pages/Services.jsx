import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useSeo } from '../hooks/useSeo';
import { formatDuration, formatPrice } from '../utils/format';

function firstTopLevelCategoryId(categories) {
  return categories.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order)[0]?.id ?? null;
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
  const [category, setCategory] = useState(null);
  const [subcategory, setSubcategory] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch('/services')
      .then(setServices)
      .catch(() => setError(true));
    apiFetch('/service-categories')
      .then((cats) => {
        setCategories(cats);
        setCategory((current) => current ?? firstTopLevelCategoryId(cats));
      })
      .catch(() => {});
  }, []);

  const topLevelCategories = useMemo(() => categories.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order), [categories]);
  const subcategories = useMemo(
    () => categories.filter((c) => c.parent_id === category).sort((a, b) => a.sort_order - b.sort_order),
    [categories, category],
  );
  const visibleServices = useMemo(() => {
    if (!services) return [];
    const matchingCategoryIds = subcategory
      ? [subcategory]
      : categories.filter((c) => c.id === category || c.parent_id === category).map((c) => c.id);
    const idSet = new Set(matchingCategoryIds);
    return services.filter((s) => idSet.has(s.category_id));
  }, [services, categories, category, subcategory]);

  function pickCategory(id) {
    setCategory(id);
    setSubcategory(null);
  }

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

          {!error && services && (
            <>
              <div className="category-tabs center" role="tablist" aria-label="Choisir une catégorie">
                {topLevelCategories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="tab"
                    aria-selected={category === c.id}
                    className={`category-tab ${category === c.id ? 'is-active' : ''}`}
                    onClick={() => pickCategory(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              {subcategories.length > 0 && (
                <div className="subcategory-tabs center" role="tablist" aria-label="Affiner par sous-catégorie">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!subcategory}
                    className={`subcategory-tab ${!subcategory ? 'is-active' : ''}`}
                    onClick={() => setSubcategory(null)}
                  >
                    Tout
                  </button>
                  {subcategories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="tab"
                      aria-selected={subcategory === c.id}
                      className={`subcategory-tab ${subcategory === c.id ? 'is-active' : ''}`}
                      onClick={() => setSubcategory(c.id)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="services-grid">
                {visibleServices.map((s) => <ServiceCard key={s.id} service={s} />)}
              </div>
            </>
          )}

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
