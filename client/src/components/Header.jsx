import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSiteConfig } from '../context/SiteConfigContext';
import logo from '../assets/logo.svg';

export default function Header() {
  const { siteName, navLinks } = useSiteConfig();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand" to="/" onClick={() => setIsOpen(false)}>
          <img className="brand-logo" src={logo} alt={siteName} />
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
