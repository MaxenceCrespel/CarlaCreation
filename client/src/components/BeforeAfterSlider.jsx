import { useCallback, useEffect, useRef, useState } from 'react';

// Plays a brief, one-time "wiggle" demo shortly after the slider appears —
// nudges the handle left/right so first-time visitors immediately get that
// it's draggable, without an infinite/distracting animation. Cancelled the
// instant the visitor actually touches it.
const DEMO_STEPS = [
  { at: 450, position: 28 },
  { at: 1050, position: 72 },
  { at: 1650, position: 50 },
  { at: 2250, position: null }, // null = end the demo (drop the transition)
];

export default function BeforeAfterSlider({ beforeUrl, afterUrl, altText }) {
  const [position, setPosition] = useState(50);
  const [isDemoing, setIsDemoing] = useState(true);
  const containerRef = useRef(null);
  const dragging = useRef(false);
  const timers = useRef([]);

  useEffect(() => {
    timers.current = DEMO_STEPS.map(({ at, position: pos }) =>
      setTimeout(() => {
        if (pos === null) setIsDemoing(false);
        else setPosition(pos);
      }, at),
    );
    return () => timers.current.forEach(clearTimeout);
  }, []);

  function stopDemo() {
    timers.current.forEach(clearTimeout);
    setIsDemoing(false);
  }

  const updateFromClientX = useCallback((clientX) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, ratio)));
  }, []);

  function onPointerDown(e) {
    stopDemo();
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
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    stopDemo();
    if (e.key === 'ArrowLeft') setPosition((p) => Math.max(0, p - 5));
    if (e.key === 'ArrowRight') setPosition((p) => Math.min(100, p + 5));
  }

  return (
    <div ref={containerRef} className="before-after-slider">
      <img src={`/${afterUrl}`} alt={`Après — ${altText}`} className="before-after-img before-after-img-after" draggable={false} />
      <div
        className={`before-after-clip${isDemoing ? ' is-demoing' : ''}`}
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img src={`/${beforeUrl}`} alt={`Avant — ${altText}`} className="before-after-img before-after-img-before" draggable={false} />
      </div>
      <div
        className={`before-after-handle${isDemoing ? ' is-demoing' : ''}`}
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
        <span className="before-after-handle-grip" aria-hidden="true">
          <span className="before-after-handle-icon">↔</span>
        </span>
      </div>
      <span className="before-after-label before-after-label-before" aria-hidden="true">Avant</span>
      <span className="before-after-label before-after-label-after" aria-hidden="true">Après</span>
    </div>
  );
}
