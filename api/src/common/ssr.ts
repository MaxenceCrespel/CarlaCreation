import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { config } from '../config';

// Prérendu des pages publiques : le serveur produit le HTML de la page avec
// le même code React que le navigateur (bundle `client/dist-ssr`), pour que
// Google lise le contenu sans exécuter de JavaScript. En cas de problème
// (bundle absent, erreur de rendu), la page est servie comme avant : le
// navigateur la construit lui-même. Le prérendu ne peut donc jamais casser
// une page.

type Preload = Record<string, unknown>;
type RenderFn = (url: string, preload: Preload) => string;

// Données de l'API nécessaires au rendu de chaque page (clés = adresses d'API,
// identiques à celles que le client appelle).
const ROUTE_DATA: Record<string, string[]> = {
  '/': ['/services', '/service-categories', '/gallery', '/reviews'],
  '/services': ['/services', '/service-categories'],
  '/gallery': ['/gallery', '/service-categories'],
};
const ALWAYS = ['/site-config'];

// Secret propre à ce processus : les appels que le serveur s'adresse à lui-même
// pour le prérendu portent cet en-tête et échappent à la limite de requêtes
// (sinon toutes les visites partageraient l'adresse 127.0.0.1 et la satureraient).
export const SSR_SECRET = randomBytes(16).toString('hex');

// Le contenu passe par l'API elle-même (boucle locale) : exactement les mêmes
// réponses que celles reçues par le navigateur. Pas de cache : une nouvelle
// prestation, un avis validé ou une photo ajoutée apparaît immédiatement.
async function fetchData(key: string): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${config.PORT}/api${key}`, {
    headers: { 'x-ssr-secret': SSR_SECRET },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`${key}: HTTP ${res.status}`);
  return res.json();
}

export async function loadPreload(urlPath: string): Promise<Preload> {
  const keys = [...ALWAYS, ...(ROUTE_DATA[urlPath] ?? [])];
  const entries = await Promise.all(keys.map(async (key) => [key, await fetchData(key).catch(() => undefined)] as const));
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

// `import()` natif : le build de l'API (CommonJS) le transformerait en require(),
// qui ne sait pas charger ce module ES.
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{ render: RenderFn }>;

let renderer: Promise<RenderFn | null> | null = null;

export function loadRenderer(ssrDir: string): Promise<RenderFn | null> {
  renderer ??= (async () => {
    const entry = path.join(ssrDir, 'entry-server.js');
    if (!fs.existsSync(entry)) return null;
    return (await nativeImport(pathToFileURL(entry).href)).render;
  })().catch(() => null);
  return renderer;
}

// Échappe ce qui pourrait refermer la balise <script> ou casser le JSON.
export function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

// Place le rendu dans le gabarit HTML : contenu dans #root, données de l'API
// dans window.__PRELOAD__ (lu par le client pour afficher la même chose).
export function injectRendered(html: string, appHtml: string, preload: Preload): string {
  if (!html.includes('<div id="root"></div>')) return html;
  return html
    .replace('<div id="root"></div>', () => `<div id="root">${appHtml}</div>`)
    .replace('</head>', () => `    <script>window.__PRELOAD__=${safeJson(preload)};</script>\n  </head>`);
}

export async function renderPage(ssrDir: string, urlPath: string): Promise<{ appHtml: string; preload: Preload } | null> {
  try {
    const render = await loadRenderer(ssrDir);
    if (!render) return null;
    const preload = await loadPreload(urlPath);
    return { appHtml: render(urlPath, preload), preload };
  } catch {
    return null;
  }
}
