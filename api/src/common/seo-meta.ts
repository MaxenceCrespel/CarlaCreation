import type { NextFunction, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

// The site is a single-page app: every route used to be served the same
// index.html, and the title / description were only set once the JavaScript
// had run. Crawlers that don't run it well (Bing, link previews in WhatsApp
// or Facebook) therefore saw the homepage's tags on every page. This
// middleware serves each public route's own title, description and canonical
// straight in the HTML. The strings mirror the useSeo() calls of the matching
// pages (client/src/pages) — keep them in sync.
const SITE = 'Carla Création';
interface Meta {
  title: string;
  description: string;
  noindex?: boolean;
}

const PUBLIC: Record<string, Meta> = {
  '/': {
    title: `${SITE} — Coiffeuse à domicile et ongles, Loos & Lille`,
    description:
      "Carla Création, coiffeuse à domicile à Loos et Lille : coupe, balayage, couleur, chignon et mariage. Pose d'ongles, semi-permanent et nail art. Réservez en ligne.",
  },
  '/services': {
    title: `Tarifs coiffure et pose d'ongles à Loos, Lille | ${SITE}`,
    description:
      "Tous mes tarifs et durées de coiffeuse à Loos, près de Lille : coupe, coloration, balayage, brushing, pose d'ongles, semi-permanent, manucure et nail art.",
  },
  '/gallery': {
    title: `Réalisations coiffure et nail art à Loos, Lille | ${SITE}`,
    description: 'Coupes, colorations, balayages, manucures et nail art réalisés dans mon studio à Loos, près de Lille — découvrez mes réalisations en photos.',
  },
  '/booking': {
    title: `Rendez-vous coiffeuse et ongles à Loos, Lille | ${SITE}`,
    description: 'Réservez votre rendez-vous coiffeuse ou ongles en ligne à Loos, près de Lille (Hauts-de-France), 24h/24, en quelques clics.',
  },
  '/contact': {
    title: `Contact — Coiffeuse et ongles à Loos, près de Lille | ${SITE}`,
    description: "Téléphone, email et formulaire de contact de ma prestation de coiffeuse et d'ongles à Loos, près de Lille (Hauts-de-France).",
  },
  '/a-propos': {
    title: `À propos — Coiffeuse à domicile à Lille, Loos, Ronchin, Wattignies | ${SITE}`,
    description:
      'Carla Création, coiffeuse et prothésiste ongulaire à Loos : coupes femme, balayage, couleur, chignons et coiffures de mariage, à domicile autour de Lille ou au studio.',
  },
  '/coiffeuse-a-domicile': {
    title: `Coiffeuse à domicile à Loos, Lille et alentours | ${SITE}`,
    description:
      'Coiffeuse à domicile à Loos, Lille, Ronchin, Wattignies, Seclin, Tourcoing : coupe, balayage, couleur, chignon et coiffure de mariage chez vous. Réservation en ligne.',
  },
};

// Pages that must never be indexed (private by nature).
const PRIVATE_PREFIXES = ['/mon-compte', '/mon-rendez-vous', '/verification-email', '/mot-de-passe-oublie'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderSeoHtml(template: string, urlPath: string): string | null {
  const meta = PUBLIC[urlPath];
  const isPrivate = PRIVATE_PREFIXES.some((p) => urlPath === p || urlPath.startsWith(`${p}/`));
  if (!meta && !isPrivate) return null;

  let html = template;
  if (meta) {
    const url = `${config.PUBLIC_ORIGIN}${urlPath === '/' ? '/' : urlPath}`;
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(meta.description)}" />`)
      .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(meta.title)}" />`)
      .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${esc(meta.description)}" />`)
      .replace('</head>', `    <link rel="canonical" href="${url}" />\n    <meta property="og:url" content="${url}" />\n  </head>`);
  } else {
    html = html.replace(/<meta name="robots" content="[^"]*" \/>/, '<meta name="robots" content="noindex, nofollow" />');
  }
  return html;
}

// Old/guessed URLs that were shared or crawled: send them to the real page.
const REDIRECTS: Record<string, string> = {
  '/a-domicile': '/coiffeuse-a-domicile',
};

export function seoMetaMiddleware(clientDist: string) {
  const indexPath = path.join(clientDist, 'index.html');
  let template: string | null = null;
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== 'GET' || !(req.headers.accept ?? '').includes('text/html')) return next();
    const target = REDIRECTS[req.path.replace(/\/+$/, '')];
    if (target) return res.redirect(301, target);
    try {
      template ??= fs.readFileSync(indexPath, 'utf8');
      const html = renderSeoHtml(template, req.path.replace(/\/+$/, '') || '/');
      if (!html) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html').send(html);
    } catch {
      next();
    }
  };
}
