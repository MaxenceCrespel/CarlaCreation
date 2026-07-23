import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import { useSiteConfig } from '../context/SiteConfigContext';

// Injects/updates a single site-wide LocalBusiness JSON-LD script so search
// engines can show rich results (phone, email) — this only needs to exist
// once per page load, not per route. Deliberately no `address` field: Carla
// works from home / travels to clients, the postal address must only ever
// appear in the booking confirmation email (see MailService), never here.
function useLocalBusinessSchema() {
  const { siteName, sitePhoneHref, siteEmail, siteUrl } = useSiteConfig();

  useEffect(() => {
    if (!siteUrl) return;

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'HairSalon',
      name: siteName,
      url: siteUrl,
      image: `${siteUrl}/favicon.svg`,
      telephone: sitePhoneHref || undefined,
      email: siteEmail || undefined,
    };

    let el = document.querySelector('script[data-seo="local-business"]');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.setAttribute('data-seo', 'local-business');
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(schema);
  }, [siteName, sitePhoneHref, siteEmail, siteUrl]);
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
