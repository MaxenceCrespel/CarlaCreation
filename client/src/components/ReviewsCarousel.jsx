import { useCallback, useEffect, useRef, useState } from 'react';

function Stars({ value }) {
  return (
    <span className="stars" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? 'star is-filled' : 'star'}>★</span>
      ))}
    </span>
  );
}

// Auto-advancing horizontal carousel, but also fully slidable by hand
// (touch swipe, trackpad, or the arrow buttons) via native CSS scroll-snap
// — no drag-handling JS needed, the browser does it for free. Several cards
// are visible at once, but every step (autoplay tick, arrow, dot) moves one
// card at a time — jumping by a full screenful would skip cards. Loops back
// to the start after the last card. Autoplay pauses for a while whenever
// the visitor interacts, so it never fights them mid-swipe.
export default function ReviewsCarousel({ reviews }) {
  const trackRef = useRef(null);
  const [itemsPerView, setItemsPerView] = useState(1);
  const [index, setIndex] = useState(0);
  const pausedRef = useRef(false);
  const resumeTimer = useRef(null);
  const count = reviews.length;
  // The last (itemsPerView - 1) cards can't be scrolled to the very start
  // of the track without empty space after them — those positions aren't
  // reachable, so cap the index there instead of offering dead dots that
  // visibly do nothing when clicked.
  const maxIndex = Math.max(0, count - itemsPerView);

  // How many cards actually fit side by side in the visible track.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    function measure() {
      const first = track.children[0];
      if (!first) return;
      const itemWidth = first.getBoundingClientRect().width;
      const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || '0') || 0;
      if (itemWidth <= 0) return;
      const perView = Math.max(1, Math.round((track.clientWidth + gap) / (itemWidth + gap)));
      setItemsPerView(perView);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [count]);

  // Our own scrollTo() calls fire native "scroll" events too, same as a
  // real swipe. Rather than guessing how long the smooth-scroll animation
  // takes (a big wraparound jump takes longer than a one-card step), wait
  // for scrolling to actually go idle, then check which card it landed
  // closest to — if that's the card we asked for, it was us, not the
  // visitor, so don't treat it as a manual interaction. Comparing the
  // *landed-on card* rather than the exact pixel offset also survives
  // CSS scroll-snap nudging the final position by a few px.
  const programmatic = useRef(false);
  const targetIndex = useRef(0);
  const scrollIdleTimer = useRef(null);

  const scrollToIndex = useCallback((i) => {
    const track = trackRef.current;
    const child = track?.children[i];
    if (!child) return;
    programmatic.current = true;
    targetIndex.current = i;
    track.scrollTo({ left: child.offsetLeft, behavior: 'smooth' });
  }, []);

  const goTo = useCallback(
    (i) => {
      const span = maxIndex + 1;
      const next = ((i % span) + span) % span;
      setIndex(next);
      scrollToIndex(next);
    },
    [maxIndex, scrollToIndex],
  );

  function pauseAutoplay() {
    pausedRef.current = true;
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      pausedRef.current = false;
    }, 8000);
  }

  useEffect(() => {
    if (maxIndex <= 0) return undefined;
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      setIndex((i) => {
        const next = i >= maxIndex ? 0 : i + 1;
        scrollToIndex(next);
        return next;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [maxIndex, scrollToIndex]);

  useEffect(
    () => () => {
      clearTimeout(resumeTimer.current);
      clearTimeout(scrollIdleTimer.current);
    },
    [],
  );

  function onScroll() {
    clearTimeout(scrollIdleTimer.current);
    scrollIdleTimer.current = setTimeout(handleScrollSettled, 120);
  }

  function handleScrollSettled() {
    const track = trackRef.current;
    if (!track) return;

    let closest = 0;
    let closestDist = Infinity;
    [...track.children].forEach((child, i) => {
      const dist = Math.abs(child.offsetLeft - track.scrollLeft);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    closest = Math.min(closest, maxIndex);

    const wasOurOwnMove = programmatic.current && closest === targetIndex.current;
    programmatic.current = false;
    setIndex(closest);
    if (wasOurOwnMove) return; // our own navigation — no need to pause autoplay
    pauseAutoplay();
  }

  return (
    <div className="reviews-carousel">
      {maxIndex > 0 && (
        <button type="button" className="reviews-carousel-nav reviews-carousel-prev" onClick={() => { pauseAutoplay(); goTo(index - 1); }} aria-label="Avis précédent">
          ‹
        </button>
      )}
      <div className="reviews-carousel-track" ref={trackRef} onScroll={onScroll} role="region" aria-label="Avis clients">
        {reviews.map((review) => (
          <blockquote className="testimonial-card reviews-carousel-item" key={review.id}>
            <Stars value={review.rating} />
            <p>« {review.comment} »</p>
            <footer>— {review.clientName}</footer>
          </blockquote>
        ))}
      </div>
      {maxIndex > 0 && (
        <button type="button" className="reviews-carousel-nav reviews-carousel-next" onClick={() => { pauseAutoplay(); goTo(index + 1); }} aria-label="Avis suivant">
          ›
        </button>
      )}
      {maxIndex > 0 && (
        <div className="reviews-carousel-dots" role="tablist" aria-label="Aller à un avis">
          {Array.from({ length: maxIndex + 1 }).map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Avis ${i + 1}`}
              className={`reviews-carousel-dot ${i === index ? 'is-active' : ''}`}
              onClick={() => { pauseAutoplay(); goTo(i); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
