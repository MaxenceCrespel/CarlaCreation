import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useSeo } from '../hooks/useSeo';
import GalleryGrid from '../components/GalleryGrid';

export default function Gallery() {
  useSeo({
    title: 'Galerie de réalisations à Lille',
    description: 'Coupes, colorations, balayages, manucures et nail art réalisés dans mon studio de Lille — découvrez mes réalisations en photos.',
    path: '/gallery',
  });
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState(null); // null = "Toutes"
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch('/gallery')
      .then(setItems)
      .catch(() => setError(true));
    apiFetch('/service-categories')
      .then(setCategories)
      .catch(() => {});
  }, []);

  const topLevelCategories = useMemo(() => categories.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order), [categories]);

  // Only categories actually used by at least one photo are worth showing
  // as a filter — no point offering a tab that would always be empty.
  const usedCategoryIds = useMemo(() => new Set((items ?? []).map((i) => i.category_id).filter(Boolean)), [items]);
  const visibleTopLevel = useMemo(
    () => topLevelCategories.filter((c) => usedCategoryIds.has(c.id) || categories.some((sub) => sub.parent_id === c.id && usedCategoryIds.has(sub.id))),
    [topLevelCategories, usedCategoryIds, categories],
  );

  const visibleItems = useMemo(() => {
    if (!items) return [];
    if (!category) return items;
    const matchingCategoryIds = new Set(categories.filter((c) => c.id === category || c.parent_id === category).map((c) => c.id));
    return items.filter((i) => matchingCategoryIds.has(i.category_id));
  }, [items, categories, category]);

  return (
    <>
      <section className="section page-hero">
        <div className="container">
          <p className="eyebrow center">Mes réalisations</p>
          <h1 className="center">Quelques-uns de mes travaux</h1>
          <p className="section-lead center">Un aperçu de mes coupes, colorations, manucures et nail art réalisés en studio.</p>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          {error && <p className="loading-text">Impossible de charger la galerie pour le moment.</p>}
          {!error && !items && <p className="loading-text">Chargement des photos…</p>}

          {!error && items && visibleTopLevel.length > 0 && (
            <div className="category-tabs center" role="tablist" aria-label="Filtrer par catégorie">
              <button
                type="button"
                role="tab"
                aria-selected={!category}
                className={`category-tab ${!category ? 'is-active' : ''}`}
                onClick={() => setCategory(null)}
              >
                Toutes
              </button>
              {visibleTopLevel.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={category === c.id}
                  className={`category-tab ${category === c.id ? 'is-active' : ''}`}
                  onClick={() => setCategory(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {!error && items && <GalleryGrid items={visibleItems} />}
          <p className="center" style={{ marginTop: 40 }}>
            <Link to="/booking" className="btn btn-primary">Réserver un créneau</Link>
          </p>
        </div>
      </section>
    </>
  );
}
