import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const SNOOZE_KEY = 'installBannerSnoozedUntil';
const VISITS_KEY = 'carla-visit-count';
export const BOOKING_DONE_KEY = 'carla-booking-done';
const SNOOZE_DAYS = 30;

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

// A PWA install is bound to the origin it was installed from: installing
// from a test environment would break the day the real site moves. Never
// offer it there.
function isTestEnvironment() {
  return /^(staging|preprod)\./.test(window.location.hostname);
}

function readNumber(key) {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

// Not shown on a first visit: only after a first successful booking, or from
// the second visit on, and never while the client is in the booking flow.
// "Plus tard" is remembered for 30 days. Android/desktop Chrome fires
// `beforeinstallprompt` once the PWA criteria are met — captured and
// re-triggered from our own button. iOS Safari never fires it: show manual
// "Partager → Sur l'écran d'accueil" steps instead.
export default function InstallAppBanner() {
  const { pathname } = useLocation();
  const [eligible, setEligible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone() || isTestEnvironment() || readNumber(SNOOZE_KEY) > Date.now()) return undefined;

    try {
      if (!sessionStorage.getItem('carla-visit-counted')) {
        sessionStorage.setItem('carla-visit-counted', '1');
        localStorage.setItem(VISITS_KEY, String(readNumber(VISITS_KEY) + 1));
      }
    } catch {
      // Storage unavailable (private mode): the banner simply never shows.
      return undefined;
    }
    setEligible(readNumber(VISITS_KEY) >= 2 || readNumber(BOOKING_DONE_KEY) > 0);

    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setDeferredPrompt(event);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  function snooze() {
    setDismissed(true);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000));
    } catch {
      // ignore
    }
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    snooze();
  }

  const ios = isIOS();
  const canInstall = ios || deferredPrompt;
  if (!eligible || dismissed || !canInstall || pathname === '/booking' || pathname.startsWith('/mon-rendez-vous')) return null;

  return (
    <div className="install-banner" role="dialog" aria-label="Installer l'application">
      <div className="install-banner-head">
        <img src="/icon-192.png" alt="" className="install-banner-icon" />
        <div className="install-banner-text">
          <strong>Ajouter à l'écran d'accueil</strong>
          <span>Réservez et suivez vos rendez-vous en un geste.</span>
        </div>
        <button type="button" className="install-banner-close" onClick={snooze} aria-label="Fermer">✕</button>
      </div>
      {ios ? (
        <p className="install-banner-ios">Sur iPhone : bouton <strong>Partager</strong> puis « Sur l'écran d'accueil ».</p>
      ) : (
        <div className="install-banner-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={snooze}>Plus tard</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleInstall}>Installer</button>
        </div>
      )}
    </div>
  );
}
