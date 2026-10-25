import { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../api/client';

const FALLBACK = {
  siteName: 'Carla Création',
  siteTagline: 'Coiffure & Ongles',
  // Real values (same as api/src/site-config.ts) so the first paint already
  // has its final text — otherwise the page jumps when the config arrives.
  sitePhone: '06 19 64 07 66',
  sitePhoneHref: '+33619640766',
  siteEmail: 'carlacreation59@gmail.com',
  sitePublicArea: 'Loos, 59120',
  legalForm: '',
  siret: '',
  instagramUrl: 'https://www.instagram.com/creationbycarla/',
  googleReviewUrl: 'https://g.page/r/CZxWuZLVNj8NEBM/review',
  siteUrl: '',
  travelFeeFallbackCents: 200,
  travelFreeRadiusKm: 10,
  stripeEnabled: false,
  navLinks: [
    { href: '/', label: 'Accueil', key: 'home' },
    { href: '/services', label: 'Prestations', key: 'services' },
    { href: '/gallery', label: 'Réalisations', key: 'gallery' },
    { href: '/a-propos', label: 'À propos', key: 'about' },
    { href: '/contact', label: 'Contact', key: 'contact' },
  ],
};

const SiteConfigContext = createContext(FALLBACK);

export function SiteConfigProvider({ children }) {
  const [siteConfig, setSiteConfig] = useState(FALLBACK);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/site-config')
      .then((data) => {
        if (!cancelled) setSiteConfig(data);
      })
      .catch(() => {
        // keep fallback branding if the API isn't reachable yet
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <SiteConfigContext.Provider value={siteConfig}>{children}</SiteConfigContext.Provider>;
}

export function useSiteConfig() {
  return useContext(SiteConfigContext);
}
