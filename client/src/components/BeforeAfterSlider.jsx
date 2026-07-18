import { useCallback, useRef, useState } from 'react';

export default function BeforeAfterSlider({ beforeUrl, afterUrl, altText }) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef(null);
  const dragging = useRef(false);

  const updateFromClientX = useCallback((clientX) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, ratio)));
  }, []);

  function onPointerDown(e) {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  }

  function onPointerMove(e) {
    if (!dragging.current) return;
    updateFromClientX(e.clientX);
  }

  function onPointerUp() {
    dragging.current = false;
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowLeft') setPosition((p) => Math.max(0, p - 5));
    if (e.key === 'ArrowRight') setPosition((p) => Math.min(100, p + 5));
  }

  return (
    <div ref={containerRef} className="before-after-slider">
      <img src={`/${afterUrl}`} alt={`Après — ${altText}`} className="before-after-img before-after-img-after" draggable={false} />
      <div className="before-after-clip" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        <img src={`/${beforeUrl}`} alt={`Avant — ${altText}`} className="before-after-img before-after-img-before" draggable={false} />
      </div>
      <div
        className="before-after-handle"
        style={{ left: `${position}%` }}
        role="slider"
        tabIndex={0}
        aria-label={`Curseur de comparaison avant/après pour ${altText}`}
        aria-valuenow={Math.round(position)}
        aria-valuemin={0}
        aria-valuemax={100}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <span className="before-after-handle-grip" aria-hidden="true" />
      </div>
      <span className="before-after-label before-after-label-before" aria-hidden="true">Avant</span>
      <span className="before-after-label before-after-label-after" aria-hidden="true">Après</span>
    </div>
  );
}
