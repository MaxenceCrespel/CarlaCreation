import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import LoginForm from './LoginForm';
import DashboardTab from './DashboardTab';
import ReservationsTab from './ReservationsTab';
import GalleryTab from './GalleryTab';
import HoursTab from './HoursTab';
import ServicesTab from './ServicesTab';
import AvisTab from './AvisTab';
import AccountTab from './AccountTab';
import StockTab from './StockTab';
import FacturationTab from './FacturationTab';
import DepensesTab from './DepensesTab';
import ClientsTab from './ClientsTab';
import PromotionsTab from './PromotionsTab';

const TABS = [
  { key: 'dashboard', label: 'Tableau de bord', Component: DashboardTab },
  { key: 'reservations', label: 'Réservations', Component: ReservationsTab },
  { key: 'clients', label: 'Clients', Component: ClientsTab },
  { key: 'gallery', label: 'Galerie', Component: GalleryTab },
  { key: 'services', label: 'Prestations', Component: ServicesTab },
  { key: 'hours', label: 'Horaires', Component: HoursTab },
  { key: 'stock', label: 'Stock', Component: StockTab },
  { key: 'facturation', label: 'Facturation', Component: FacturationTab },
  { key: 'depenses', label: 'Dépenses', Component: DepensesTab },
  { key: 'promotions', label: 'Promotions', Component: PromotionsTab },
  { key: 'reviews', label: 'Avis', Component: AvisTab },
  { key: 'account', label: 'Mon compte', Component: AccountTab },
];

export default function AdminApp() {
  const [session, setSession] = useState('checking'); // 'checking' | null | { username }
  const [activeTab, setActiveTab] = useState('dashboard');
  // Sidebar on desktop is always visible; on mobile it becomes a slide-in
  // drawer toggled by the burger button, and this same flag controls it.
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    apiFetch('/auth/me')
      .then((data) => setSession({ username: data.username }))
      .catch(() => setSession(null));
  }, []);

  // Lock background scroll while the mobile drawer is open — otherwise the
  // page behind it scrolls along with a touch drag on the overlay.
  useEffect(() => {
    document.body.style.overflow = navOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [navOpen]);

  async function handleLogout() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (_) {
      // ignore
    }
    setSession(null);
  }

  if (session === 'checking') {
    return <div className="admin-body" />;
  }

  if (!session) {
    return (
      <div className="admin-body">
        <LoginForm onLoggedIn={(username) => setSession({ username })} />
      </div>
    );
  }

  const ActiveComponent = TABS.find((t) => t.key === activeTab)?.Component ?? ReservationsTab;

  return (
    <div className="admin-body">
      <header className="admin-header">
        <div className="container admin-header-inner">
          <div className="admin-header-left">
            <button
              type="button"
              className="admin-burger"
              aria-label="Ouvrir le menu"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(true)}
            >
              <span />
              <span />
              <span />
            </button>
            <h1>Administration</h1>
          </div>
          <div className="admin-header-actions">
            <span className="admin-username">{session.username}</span>
            <button type="button" className="btn btn-outline" onClick={handleLogout}>Se déconnecter</button>
          </div>
        </div>
      </header>

      <div className="container admin-layout">
        {navOpen && <div className="admin-sidebar-backdrop" onClick={() => setNavOpen(false)} />}

        <nav className={`admin-sidebar ${navOpen ? 'is-open' : ''}`} aria-label="Sections de l'administration">
          <div className="admin-sidebar-header">
            <span>Menu</span>
            <button type="button" className="admin-sidebar-close" aria-label="Fermer le menu" onClick={() => setNavOpen(false)}>✕</button>
          </div>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-current={activeTab === tab.key ? 'page' : undefined}
              className={`admin-nav-link ${activeTab === tab.key ? 'is-active' : ''}`}
              onClick={() => {
                setActiveTab(tab.key);
                setNavOpen(false);
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <main className="admin-main">
          <ActiveComponent username={session.username} onCredentialsUpdated={(newUsername) => setSession({ username: newUsername })} />
        </main>
      </div>
    </div>
  );
}
