// Données de l'API déjà chargées par le serveur pour la page demandée.
//
// Le serveur rend les pages publiques en HTML (voir api/src/common/ssr.ts) et
// y joint les réponses de l'API dans `window.__PRELOAD__`, pour que le
// navigateur affiche tout de suite le même contenu et que Google le lise sans
// exécuter de JavaScript. Côté serveur, `setServerPreload` fournit ces données
// avant chaque rendu.
let serverData = {};

export function setServerPreload(data) {
  serverData = data ?? {};
}

// Renvoie la donnée préchargée pour une adresse d'API, ou undefined. Dans le
// navigateur elle n'est servie qu'une fois : les affichages suivants
// (navigation dans le site) redemandent des données fraîches.
export function takePreload(key) {
  if (typeof window === 'undefined') return serverData[key];
  const store = window.__PRELOAD__;
  if (!store || !(key in store)) return undefined;
  const value = store[key];
  delete store[key];
  return value;
}
