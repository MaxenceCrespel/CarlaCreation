// Site branding & content, shared by the API (exposed via GET /api/site-config)
// and consumed by the React frontend. This is the one file to edit for a
// rebrand — no route/component code needs to change.
export const siteConfig = {
  siteName: 'Carla Création',
  siteTagline: 'Coiffure & Ongles — Révéler votre beauté, sublimer votre confiance',
  sitePhone: '06 19 64 07 66',
  sitePhoneHref: '+33619640766',
  siteEmail: 'contact@carlacreation.example',
  siteAddress: '15 rue Faidherbe, 59000 Lille',
  navLinks: [
    { href: '/', label: 'Accueil', key: 'home' },
    { href: '/services', label: 'Prestations', key: 'services' },
    { href: '/gallery', label: 'Réalisations', key: 'gallery' },
    { href: '/contact', label: 'Contact', key: 'contact' },
  ],
};

export type SiteConfig = typeof siteConfig;
