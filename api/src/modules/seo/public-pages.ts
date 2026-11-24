// Pages publiques listées dans le plan du site et signalées à IndexNow.
// `sources` : contenus de la base affichés sur la page, dont la date la plus
// récente fait avancer le <lastmod> (une nouvelle photo, un nouvel avis).
export type ContentSource = 'gallery' | 'reviews';

export const PUBLIC_PAGES: { path: string; priority: string; changefreq: string; sources: ContentSource[] }[] = [
  { path: '/', priority: '1.0', changefreq: 'weekly', sources: ['gallery', 'reviews'] },
  { path: '/services', priority: '0.8', changefreq: 'weekly', sources: [] },
  { path: '/gallery', priority: '0.6', changefreq: 'weekly', sources: ['gallery'] },
  { path: '/booking', priority: '0.9', changefreq: 'weekly', sources: [] },
  { path: '/coiffeuse-a-domicile', priority: '0.8', changefreq: 'monthly', sources: [] },
  { path: '/a-propos', priority: '0.7', changefreq: 'monthly', sources: [] },
  { path: '/contact', priority: '0.5', changefreq: 'monthly', sources: [] },
];
