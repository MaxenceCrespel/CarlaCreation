import { useEffect } from 'react';

function upsertMeta(attr, key, content) {
  if (!content) return;
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel, href) {
  if (!href) return;
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// Sets the document title plus standard/Open Graph/Twitter meta tags for
// whichever page calls it. Plain DOM manipulation instead of a library like
// react-helmet — this SPA only has a handful of routes, each calling this
// once on mount, so a dependency isn't worth it.
// Pages that must never show up in Google (private tracking links, account
// screens): `noindex` — and every other page explicitly resets it, since the
// tag would otherwise linger when navigating from a private page to a public one.
const DEFAULT_IMAGE = '/og-image.png';

export function useSeo({ title, description, path, image = DEFAULT_IMAGE, noindex = false }) {
  useEffect(() => {
    const fullTitle = title ? `${title} | Carla Création` : 'Carla Création — Coiffeuse à domicile et ongles, Loos & Lille';
    document.title = fullTitle;

    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:type', 'website');
    upsertMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');

    const origin = window.location.origin;
    const url = path ? `${origin}${path}` : window.location.href;
    upsertMeta('property', 'og:url', url);
    upsertLink('canonical', url);

    if (image) {
      const absoluteImage = image.startsWith('http') ? image : `${origin}${image}`;
      upsertMeta('property', 'og:image', absoluteImage);
    }
  }, [title, description, path, image, noindex]);
}
