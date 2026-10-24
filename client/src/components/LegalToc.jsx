import { useEffect, useRef, useState } from 'react';

// Collapsible table of contents for long legal texts: built from the h2
// headings already in the page (so it can never drift from the content),
// each given an anchor id. Also a floating "back to top" once scrolled.
export default function LegalToc() {
  const ref = useRef(null);
  const [items, setItems] = useState([]);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const container = ref.current?.closest('.legal-content');
    if (!container) return undefined;
    const headings = [...container.querySelectorAll('h2')];
    headings.forEach((h, i) => {
      if (!h.id) h.id = `section-${i + 1}`;
    });
    setItems(headings.map((h) => ({ id: h.id, label: h.textContent })));

    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <details className="legal-toc" ref={ref}>
        <summary>Sommaire</summary>
        <ol>
          {items.map((it) => (
            <li key={it.id}>
              <a href={`#${it.id}`}>{it.label.replace(/^\d+\.\s*/, '')}</a>
            </li>
          ))}
        </ol>
      </details>
      {showTop && (
        <button type="button" className="back-to-top" aria-label="Revenir en haut de la page" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          ↑
        </button>
      )}
    </>
  );
}
