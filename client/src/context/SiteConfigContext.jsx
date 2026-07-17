import { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../api/client';

const FALLBACK = {
  siteName: 'Carla Création',
  siteTagline: 'Coiffure & Ongles',
  sitePhone: '',
  sitePhoneHref: '',
  siteEmail: '',
  siteAddress: '',
  siteUrl: '',
  navLinks: [
    { href: '/', label: 'Accueil', key: 'home' },
    { href: '/services', label: 'Prestations', key: 'services' },
    { href: '/gallery', label: 'Réalisations', key: 'gallery' },
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
