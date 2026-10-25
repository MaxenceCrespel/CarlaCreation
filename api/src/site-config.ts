// Site branding & content, shared by the API (exposed via GET /api/site-config)
// and consumed by the React frontend. This is the one file to edit for a
// rebrand — no route/component code needs to change.
export const siteConfig = {
  siteName: 'Carla Création',
  siteTagline: 'Coiffure & Ongles — Révéler votre beauté, sublimer votre confiance',
  sitePhone: '06 19 64 07 66',
  sitePhoneHref: '+33619640766',
  siteEmail: 'carlacreation59@gmail.com',
  // Full exact address — private, only ever sent in emails (see
  // MailService). Never exposed via the public site-config API.
  siteAddress: '1 rue Georges Clemenceau, 59120 Loos',
  // City + postal code only — safe to show publicly (e.g. Contact page)
  // without pinpointing Carla's exact home/studio address.
  sitePublicArea: 'Loos, 59120',
  // Statut légal, affiché sur les mentions légales/CGV — à ajuster si
  // jamais elle change de statut (ex: passage en société).
  legalForm: 'Entreprise individuelle (micro-entreprise)',
  // Vide = les pages légales affichent "en cours d'immatriculation".
  // NB : 9 chiffres = un SIREN ; un SIRET complet en compte 14 (SIREN + NIC).
  siret: '109 692 541 00013',
  // Réseaux / avis : liens publics. googleReviewUrl = lien direct « laisser un
  // avis » de la fiche Google Business Profile (proposé à TOUTES les clientes,
  // jamais seulement aux satisfaites : Google interdit ce tri).
  instagramUrl: 'https://www.instagram.com/creationbycarla/',
  googleReviewUrl: 'https://g.page/r/CZxWuZLVNj8NEBM/review',
  navLinks: [
    { href: '/', label: 'Accueil', key: 'home' },
    { href: '/services', label: 'Prestations', key: 'services' },
    { href: '/gallery', label: 'Réalisations', key: 'gallery' },
    { href: '/contact', label: 'Contact', key: 'contact' },
  ],
};

export type SiteConfig = typeof siteConfig;
