import { useEffect, useState } from 'react';
import BeforeAfterSlider from './BeforeAfterSlider';

export default function GalleryGrid({ items, previewClass = false }) {
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    if (!lightbox) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [lightbox]);

  if (!items.length) {
    return <p className="loading-text">Aucune photo pour le moment.</p>;
  }

  return (
    <>
      <div className={`gallery-grid ${previewClass ? 'gallery-grid-preview' : ''}`}>
        {items.map((item) =>
          item.before_url ? (
            <div key={item.id} className="gallery-item gallery-item-pair">
              <BeforeAfterSlider beforeUrl={item.before_url} afterUrl={item.url} altText={item.alt_text} />
            </div>
          ) : (
            <button
              key={item.id}
              type="button"
              className="gallery-item"
              aria-label={`Agrandir : ${item.alt_text}`}
              onClick={() => setLightbox(item)}
            >
              <img src={`/${item.url}`} alt={item.alt_text} loading="lazy" />
            </button>
          ),
        )}
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <button className="lightbox-close" aria-label="Fermer" onClick={() => setLightbox(null)}>
            &times;
          </button>
          <img src={`/${lightbox.url}`} alt={lightbox.alt_text} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}
