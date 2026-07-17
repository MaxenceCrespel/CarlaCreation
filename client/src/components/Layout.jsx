import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import { useSiteConfig } from '../context/SiteConfigContext';

// French addresses are stored as a single free-text string ("15 rue
// Faidherbe, 59000 Lille") — split it into schema.org PostalAddress fields
// on a best-effort basis so the LocalBusiness structured data below stays
// valid even though the admin only ever edits one plain string.
function parseAddress(siteAddress) {
  const parts = siteAddress.split(',').map((p) => p.trim());
  const last = parts[parts.length - 1] || '';
  const match = last.match(/^(\d{5})\s+(.+)$/);
  return {
    streetAddress: parts.slice(0, -1).join(', ') || parts[0] || '',
    postalCode: match ? match[1] : '',
    addressLocality: match ? match[2] : last,
  };
}

// Injects/updates a single site-wide LocalBusiness JSON-LD script so search
// engines can show rich results (address, phone) — this only needs to exist
// once per page load, not per route.
function useLocalBusinessSchema() {
  const { siteName, sitePhoneHref, siteEmail, siteAddress, siteUrl } = useSiteConfig();

  useEffect(() => {
    if (!siteAddress || !siteUrl) return;

    const { streetAddress, postalCode, addressLocality } = parseAddress(siteAddress);
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'HairSalon',
      name: siteName,
      url: siteUrl,
      image: `${siteUrl}/favicon.svg`,
      telephone: sitePhoneHref || undefined,
      email: siteEmail || undefined,
      address: {
        '@type': 'PostalAddress',
        streetAddress,
        postalCode,
        addressLocality,
        addressRegion: 'Hauts-de-France',
        addressCountry: 'FR',
      },
    };

    let el = document.querySelector('script[data-seo="local-business"]');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.setAttribute('data-seo', 'local-business');
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(schema);
  }, [siteName, sitePhoneHref, siteEmail, siteAddress, siteUrl]);
}

export default function Layout() {
  useLocalBusinessSchema();

  return (
    <>
      <a className="skip-link" href="#main">Aller au contenu principal</a>
      <Header />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
