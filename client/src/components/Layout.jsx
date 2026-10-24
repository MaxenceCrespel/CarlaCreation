import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import InstallAppBanner from './InstallAppBanner';
import { useSiteConfig } from '../context/SiteConfigContext';
import { usePageViewTracking } from '../hooks/usePageViewTracking';
import { storeReferral } from '../utils/referralStorage';

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

// Fixed bottom bar on phones only (CSS), hidden where it would compete with
// the booking flow's own primary button.
function MobileCtaBar() {
  const { pathname } = useLocation();
  // Hidden while a field is focused: on a phone that means the keyboard is
  // open and a bar pinned to the bottom would float in the middle of the form.
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const isField = (el) => el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    const onIn = (e) => setTyping(isField(e.target));
    const onOut = () => setTyping(false);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);

  const hiddenOn = ['/booking', '/mon-compte', '/verification-email', '/mot-de-passe-oublie', '/contact'];
  if (typing || hiddenOn.includes(pathname) || pathname.startsWith('/mon-rendez-vous')) return null;
  return (
    <div className="mobile-cta-bar">
      <Link to="/booking" className="btn btn-primary btn-block">Prendre rendez-vous</Link>
    </div>
  );
}

export default function Layout() {
  useLocalBusinessSchema();
  usePageViewTracking();
  // Remember a sponsor's ?parrain=CODE whichever page the visitor lands on.
  const { search } = useLocation();
  useEffect(() => {
    const code = new URLSearchParams(search).get('parrain');
    if (code) storeReferral(code);
  }, [search]);

  return (
    <>
      <a className="skip-link" href="#main">Aller au contenu principal</a>
      <Header />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
      <MobileCtaBar />
      <InstallAppBanner />
    </>
  );
}
