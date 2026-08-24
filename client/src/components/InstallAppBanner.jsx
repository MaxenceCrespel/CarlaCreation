import { useEffect, useState } from 'react';

const DISMISSED_KEY = 'installBannerDismissed';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

// Invites visitors to add the site to their home screen, the same way the
// admin already can. Android/desktop Chrome fires `beforeinstallprompt`
// only once it decides the PWA criteria are met (manifest + HTTPS) — we
// just capture that event and re-trigger it from our own button instead of
// the native mini-infobar. iOS Safari never fires that event at all, so
// there's nothing to wait for: show the banner right away with manual
// "Partager → Sur l'écran d'accueil" instructions instead.
export default function InstallAppBanner() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISSED_KEY) === '1') return undefined;

    if (isIOS()) {
      setVisible(true);
      return undefined;
    }

    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setDeferredPrompt(event);
      setVisible(true);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  function dismiss() {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, '1');
  }

  async function handleInstall() {
    if (isIOS()) {
      setShowIosSteps(true);
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="install-banner" role="dialog" aria-label="Installer l'application">
      <img src="/icon-192.png" alt="" className="install-banner-icon" />
      <div className="install-banner-text">
        {showIosSteps ? (
          <>Appuyez sur <strong>Partager</strong> puis <strong>Sur l'écran d'accueil</strong>.</>
        ) : (
          <>Ajoutez Carla Création à votre écran d'accueil pour réserver plus vite.</>
        )}
      </div>
      <div className="install-banner-actions">
        {!showIosSteps && (
          <button type="button" className="btn btn-primary btn-sm" onClick={handleInstall}>Installer</button>
        )}
        <button type="button" className="install-banner-close" onClick={dismiss} aria-label="Fermer">✕</button>
      </div>
    </div>
  );
}
