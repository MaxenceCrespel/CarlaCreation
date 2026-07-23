import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import LoginForm from './LoginForm';
import ReservationsTab from './ReservationsTab';
import GalleryTab from './GalleryTab';
import HoursTab from './HoursTab';
import ServicesTab from './ServicesTab';
import AvisTab from './AvisTab';
import AccountTab from './AccountTab';

const TABS = [
  { key: 'reservations', label: 'Réservations', Component: ReservationsTab },
  { key: 'gallery', label: 'Galerie', Component: GalleryTab },
  { key: 'services', label: 'Prestations', Component: ServicesTab },
  { key: 'hours', label: 'Horaires', Component: HoursTab },
  { key: 'reviews', label: 'Avis', Component: AvisTab },
  { key: 'account', label: 'Mon compte', Component: AccountTab },
];

export default function AdminApp() {
  const [session, setSession] = useState('checking'); // 'checking' | null | { username }
  const [activeTab, setActiveTab] = useState('reservations');

  useEffect(() => {
    apiFetch('/auth/me')
      .then((data) => setSession({ username: data.username }))
      .catch(() => setSession(null));
  }, []);

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
          <h1>Administration</h1>
          <div className="admin-header-actions">
            <span className="admin-username">{session.username}</span>
            <button type="button" className="btn btn-outline" onClick={handleLogout}>Se déconnecter</button>
          </div>
        </div>
      </header>

      <div className="container admin-tabs" role="tablist" aria-label="Sections de l'administration">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`admin-tab ${activeTab === tab.key ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className="container admin-main">
        <ActiveComponent username={session.username} onCredentialsUpdated={(newUsername) => setSession({ username: newUsername })} />
      </main>
    </div>
  );
}
