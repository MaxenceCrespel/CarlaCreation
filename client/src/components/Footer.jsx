import { Link } from 'react-router-dom';
import { useSiteConfig } from '../context/SiteConfigContext';

export default function Footer() {
  const { siteName } = useSiteConfig();
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div>
          <span className="brand-name">{siteName}</span>
          <p>© {year} {siteName}. Tous droits réservés.</p>
        </div>
        <ul className="footer-links">
          <li><Link to="/">Accueil</Link></li>
          <li><Link to="/booking">Réserver</Link></li>
          <li><Link to="/contact">Contact</Link></li>
        </ul>
        <ul className="social-links" aria-label="Réseaux sociaux">
          <li><a href="#" aria-label="Instagram">Instagram</a></li>
          <li><a href="#" aria-label="Facebook">Facebook</a></li>
        </ul>
      </div>
    </footer>
  );
}
