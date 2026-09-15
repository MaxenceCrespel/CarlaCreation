import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { apiFetch } from '../api/client';

// Fires a lightweight beacon to the admin's own "Visiteurs" stats on every
// route change. No third-party analytics, no consent banner needed — see
// api/src/modules/analytics for what's actually recorded (no personal
// data, just an anonymous first-party visitor id, referrer bucket and
// device type).
export function usePageViewTracking() {
  const location = useLocation();

  useEffect(() => {
    apiFetch('/track', { method: 'POST', body: { path: location.pathname } }).catch(() => {
      // Tracking is best-effort — never let it surface as an error to the visitor.
    });
  }, [location.pathname]);
}
