import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSiteConfig } from '../context/SiteConfigContext';
import logo from '../assets/logo.png';

export default function Header() {
  const { siteName, navLinks } = useSiteConfig();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand" to="/" onClick={() => setIsOpen(false)}>
          <img className="brand-logo" src={logo} alt="" width="56" height="56" />
          <span className="brand-text">{siteName}</span>
        </Link>

        <nav className={`main-nav ${isOpen ? 'is-open' : ''}`} aria-label="Navigation principale">
          <ul>
            {navLinks.map((link) => (
              <li key={link.key}>
                <NavLink to={link.href} onClick={() => setIsOpen(false)} end={link.href === '/'}>
                  {link.label}
                </NavLink>
              </li>
            ))}
            {/* Rendered inside the nav (not as a separate sibling) so it's
                still reachable from the collapsed mobile menu — it used to
                just disappear below the nav breakpoint. */}
            <li className="nav-cta-item">
              <Link to="/booking" className="btn btn-primary nav-cta" onClick={() => setIsOpen(false)}>
                Prendre rendez-vous
              </Link>
            </li>
          </ul>
        </nav>

        {/* Kept outside <nav> deliberately — a persistent icon, reachable
            in one tap whether the mobile menu is open or closed, instead
            of being buried behind the hamburger like the rest of the nav. */}
        <NavLink to="/mon-compte" className="account-icon-link" aria-label="Mon compte" onClick={() => setIsOpen(false)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
          </svg>
        </NavLink>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={isOpen}
          aria-controls="main-nav"
          aria-label="Ouvrir le menu"
          onClick={() => setIsOpen((v) => !v)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </header>
  );
}
