// Site branding & content shown across the public pages. This is the one
// file to edit for a rebrand — no routing or template logic lives here.
module.exports = {
  siteName: 'Carla Création',
  siteTagline: 'Coiffure & Ongles — Révéler votre beauté, sublimer votre confiance',
  sitePhone: '06 19 64 07 66',
  sitePhoneHref: '+33619640766',
  siteEmail: 'contact@carlacreation.example',
  siteAddress: '12 rue de la Paix, 75000 Paris',
  navLinks: [
    { href: '/', label: 'Accueil', key: 'home' },
    { href: '/services', label: 'Prestations', key: 'services' },
    { href: '/gallery', label: 'Réalisations', key: 'gallery' },
    { href: '/booking', label: 'Réserver', key: 'booking' },
    { href: '/contact', label: 'Contact', key: 'contact' },
  ],
};
