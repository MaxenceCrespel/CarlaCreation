import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useSeo } from '../hooks/useSeo';
import GalleryGrid from '../components/GalleryGrid';

export default function Gallery() {
  useSeo({
    title: 'Galerie de réalisations à Lille',
    description: 'Coupes, colorations, balayages, manucures et nail art réalisés dans notre studio de Lille — découvrez nos réalisations en photos.',
    path: '/gallery',
  });
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch('/gallery')
      .then(setItems)
      .catch(() => setError(true));
  }, []);

  return (
    <>
      <section className="section page-hero">
        <div className="container">
          <p className="eyebrow center">Nos réalisations</p>
          <h1 className="center">Quelques-uns de nos travaux</h1>
          <p className="section-lead center">Un aperçu de nos coupes, colorations, manucures et nail art réalisés en studio.</p>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          {error && <p className="loading-text">Impossible de charger la galerie pour le moment.</p>}
          {!error && !items && <p className="loading-text">Chargement des photos…</p>}
          {!error && items && <GalleryGrid items={items} />}
          <p className="center" style={{ marginTop: 40 }}>
            <Link to="/booking" className="btn btn-primary">Réserver un créneau</Link>
          </p>
        </div>
      </section>
    </>
  );
}
