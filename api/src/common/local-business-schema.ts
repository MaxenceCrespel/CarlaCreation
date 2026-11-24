import { config } from '../config';
import { siteConfig } from '../site-config';

// Données « commerce local » (schema.org) de la page. Servies dans le HTML
// envoyé par le serveur pour que Google les lise sans exécuter de JavaScript.
// Volontairement : pas d'adresse ni de coordonnées GPS (Carla travaille à
// domicile, l'adresse n'apparaît que dans l'email de confirmation) et pas
// d'horaires fixes (ils changent chaque semaine, réglés dans l'admin).
export function localBusinessSchema(): Record<string, unknown> {
  const sameAs = [siteConfig.instagramUrl, siteConfig.googleProfileUrl].filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': ['HairSalon', 'NailSalon'],
    name: siteConfig.siteName,
    alternateName: 'Carla Création — coiffeuse et prothésiste ongulaire à Loos et Lille',
    description:
      "Coiffeuse et prothésiste ongulaire à Loos, près de Lille : coupe, coloration, balayage, pose d'ongles, semi-permanent, manucure et nail art, en studio ou à domicile.",
    url: config.PUBLIC_ORIGIN,
    image: `${config.PUBLIC_ORIGIN}/og-image.png`,
    logo: `${config.PUBLIC_ORIGIN}/icon-512.png`,
    telephone: siteConfig.sitePhoneHref,
    email: siteConfig.siteEmail,
    areaServed: ['Loos', 'Lille', 'Ronchin', 'Wattignies', 'Seclin', 'Tourcoing'].map((name) => ({ '@type': 'City', name })),
    paymentAccepted: 'Carte bancaire, Espèces, Chèque',
    currenciesAccepted: 'EUR',
    knowsAbout: ['Coupe femme', 'Balayage', 'Coloration', 'Chignon', 'Coiffure de mariage', "Pose d'ongles", 'Semi-permanent', 'Nail art'],
    hasMap: siteConfig.googleProfileUrl,
    sameAs,
  };
}

// Prêt à être placé dans une balise <script> : « < » échappé pour qu'aucune
// valeur ne puisse refermer la balise.
export function localBusinessJsonLd(): string {
  return JSON.stringify(localBusinessSchema()).replace(/</g, '\\u003c');
}
