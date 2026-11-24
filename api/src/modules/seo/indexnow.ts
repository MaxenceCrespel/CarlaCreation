import { Logger } from '@nestjs/common';
import { config } from '../../config';
import { PUBLIC_PAGES } from './public-pages';

// IndexNow (Bing, Yandex, Seznam…) : on signale les pages publiques à chaque
// démarrage en prod, donc à chaque déploiement. Google n'utilise pas ce
// protocole. La clé n'est pas un secret : elle est publiée à
// /<clé>.txt (SeoController) pour prouver que le site nous appartient.
// gitleaks la prend pour une clé d'API (generic-api-key) : faux positif.
export const INDEXNOW_KEY = 'd50b5ce41d575aa73cfa9750575922f8'; // gitleaks:allow
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const TIMEOUT_MS = 10_000;

const logger = new Logger('IndexNow');

// Seulement pour un vrai domaine en https : jamais en local (http://localhost),
// ni dans les conteneurs de test.
export function indexNowEnabled(origin = config.PUBLIC_ORIGIN, isProd = config.isProd): boolean {
  if (!isProd || !origin.startsWith('https://')) return false;
  const host = new URL(origin).hostname;
  return host !== 'localhost' && host !== '127.0.0.1';
}

export function indexNowPayload(origin = config.PUBLIC_ORIGIN) {
  return {
    host: new URL(origin).hostname,
    key: INDEXNOW_KEY,
    keyLocation: `${origin}/${INDEXNOW_KEY}.txt`,
    urlList: PUBLIC_PAGES.map((p) => `${origin}${p.path}`),
  };
}

// Ne lève jamais d'erreur : un échec ici ne doit pas gêner le démarrage.
export async function notifyIndexNow(fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(indexNowPayload()),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) logger.log(`${PUBLIC_PAGES.length} pages signalées (HTTP ${res.status}).`);
    else logger.warn(`Signalement refusé : HTTP ${res.status}.`);
  } catch (err) {
    logger.warn(`Signalement impossible : ${(err as Error).message}`);
  }
}
