import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useSeo } from '../hooks/useSeo';

const STATUS_LABELS = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  completed: 'Terminé',
  cancelled: 'Annulé',
  refused: 'Refusé',
};

const DAY_NAMES_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTH_NAMES_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function formatDateFr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAY_NAMES_FR[date.getDay()]} ${d} ${MONTH_NAMES_FR[m - 1]} ${y}`;
}

const EMPTY_SIGNUP = { name: '', email: '', phone: '', password: '', birthdate: '' };
const EMPTY_LOGIN = { email: '', password: '' };

function LoginSignupForms({ onLoggedIn }) {
  const showToast = useToast();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [loginForm, setLoginForm] = useState(EMPTY_LOGIN);
  const [signupForm, setSignupForm] = useState(EMPTY_SIGNUP);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleLogin(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/client-auth/login', { method: 'POST', body: loginForm });
      onLoggedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/client-auth/signup', {
        method: 'POST',
        body: { ...signupForm, birthdate: signupForm.birthdate || undefined },
      });
      showToast('Compte créé !', 'success');
      onLoggedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="manual-reservation-form-actions" style={{ marginBottom: 16 }}>
        <button type="button" className={`btn ${mode === 'login' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('login')}>
          Se connecter
        </button>
        <button type="button" className={`btn ${mode === 'signup' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('signup')}>
          Créer un compte
        </button>
      </div>

      {mode === 'login' ? (
        <form onSubmit={handleLogin}>
          <div className="form-row">
            <label htmlFor="login-email">Email</label>
            <input
              type="email"
              id="login-email"
              required
              value={loginForm.email}
              onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <label htmlFor="login-password">Mot de passe</label>
            <input
              type="password"
              id="login-password"
              required
              value={loginForm.password}
              onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          {error && <p className="form-feedback error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSignup}>
          <div className="form-row">
            <label htmlFor="signup-name">Nom</label>
            <input
              type="text"
              id="signup-name"
              required
              value={signupForm.name}
              onChange={(e) => setSignupForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <label htmlFor="signup-email">Email</label>
            <input
              type="email"
              id="signup-email"
              required
              value={signupForm.email}
              onChange={(e) => setSignupForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="form-row two-col">
            <div>
              <label htmlFor="signup-phone">Téléphone (optionnel)</label>
              <input
                type="tel"
                id="signup-phone"
                value={signupForm.phone}
                onChange={(e) => setSignupForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="signup-birthdate">Date de naissance (optionnel)</label>
              <input
                type="date"
                id="signup-birthdate"
                value={signupForm.birthdate}
                onChange={(e) => setSignupForm((f) => ({ ...f, birthdate: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="signup-password">Mot de passe (10 caractères minimum)</label>
            <input
              type="password"
              id="signup-password"
              required
              minLength={10}
              value={signupForm.password}
              onChange={(e) => setSignupForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          <p className="section-lead" style={{ fontSize: '0.85em' }}>
            Un compte permet de suivre vos rendez-vous et de profiter de la carte de fidélité (une réduction tous les
            quelques passages) et d'un code promo pour votre anniversaire.
          </p>
          {error && <p className="form-feedback error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>
      )}
    </div>
  );
}

function AccountDashboard({ profile, onUpdated }) {
  const showToast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: profile.name, phone: profile.phone, birthdate: profile.birthdate || '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/client-auth/me', { method: 'PATCH', body: { ...form, birthdate: form.birthdate || undefined } });
      showToast('Profil mis à jour.', 'success');
      setEditing(false);
      onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/client-auth/me', { method: 'PATCH', body: passwordForm });
      showToast('Mot de passe mis à jour.', 'success');
      setShowPasswordForm(false);
      setPasswordForm({ currentPassword: '', newPassword: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await apiFetch('/client-auth/logout', { method: 'POST' });
    onUpdated();
  }

  const { visitsCompleted, visitsRequired, visitsRemaining } = profile.loyalty;
  const progressPercent = Math.round(((visitsRequired - visitsRemaining) / visitsRequired) * 100);

  return (
    <>
      <div className="card">
        <div className="manual-reservation-form-actions" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Bonjour {profile.name.split(' ')[0]}</h2>
          <button type="button" className="btn btn-outline" onClick={logout}>Se déconnecter</button>
        </div>

        {!editing ? (
          <>
            <p><strong>Email :</strong> {profile.email}</p>
            {profile.phone && <p><strong>Téléphone :</strong> {profile.phone}</p>}
            {profile.birthdate && <p><strong>Date de naissance :</strong> {formatDateFr(profile.birthdate)}</p>}
            <div className="manual-reservation-form-actions">
              <button type="button" className="btn btn-outline" onClick={() => setEditing(true)}>Modifier mes infos</button>
              <button type="button" className="btn btn-outline" onClick={() => setShowPasswordForm((v) => !v)}>
                Changer de mot de passe
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={saveProfile}>
            <div className="form-row">
              <label htmlFor="account-name">Nom</label>
              <input type="text" id="account-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-row two-col">
              <div>
                <label htmlFor="account-phone">Téléphone</label>
                <input type="tel" id="account-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="account-birthdate">Date de naissance</label>
                <input
                  type="date"
                  id="account-birthdate"
                  value={form.birthdate}
                  onChange={(e) => setForm((f) => ({ ...f, birthdate: e.target.value }))}
                />
              </div>
            </div>
            {error && <p className="form-feedback error">{error}</p>}
            <div className="manual-reservation-form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button type="button" className="btn btn-outline" onClick={() => setEditing(false)}>Annuler</button>
            </div>
          </form>
        )}

        {showPasswordForm && (
          <form onSubmit={savePassword} style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-bg-alt)' }}>
            <div className="form-row">
              <label htmlFor="current-password">Mot de passe actuel</label>
              <input
                type="password"
                id="current-password"
                required
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))}
              />
            </div>
            <div className="form-row">
              <label htmlFor="new-password">Nouveau mot de passe (10 caractères minimum)</label>
              <input
                type="password"
                id="new-password"
                required
                minLength={10}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
              />
            </div>
            {error && <p className="form-feedback error">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Changer le mot de passe'}</button>
          </form>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Carte de fidélité</h2>
        <p className="section-lead">
          {visitsCompleted} passage{visitsCompleted > 1 ? 's' : ''} effectué{visitsCompleted > 1 ? 's' : ''} — encore{' '}
          <strong>{visitsRemaining}</strong> avant votre prochaine réduction (un code promo vous sera envoyé par email).
        </p>
        <div style={{ background: 'var(--color-bg-alt)', borderRadius: 8, height: 10, overflow: 'hidden' }}>
          <div style={{ background: 'var(--color-accent)', height: '100%', width: `${progressPercent}%`, transition: 'width 0.3s' }} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Historique de mes rendez-vous</h2>
        {profile.history.length === 0 ? (
          <p className="loading-text">Aucun rendez-vous pour le moment.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-alt)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Date</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Prestation</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {profile.history.map((h) => (
                <tr key={h.id}>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-bg-alt)' }}>{formatDateFr(h.reservation_date)}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-bg-alt)' }}>{h.service_name}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-bg-alt)' }}>
                    <span className={`status-badge status-${h.status}`}>{STATUS_LABELS[h.status] || h.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default function MyAccount() {
  useSeo({ title: 'Mon compte', path: '/mon-compte' });
  const [profile, setProfile] = useState(null); // undefined-ish: null = not loaded yet, false = logged out
  const [loaded, setLoaded] = useState(false);

  function load() {
    apiFetch('/client-auth/me')
      .then((data) => {
        setProfile(data);
        setLoaded(true);
      })
      .catch(() => {
        setProfile(null);
        setLoaded(true);
      });
  }

  useEffect(load, []);

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 640 }}>
        <p className="eyebrow center">Mon compte</p>
        <h1 className="center">{profile ? 'Mon espace' : 'Connexion'}</h1>

        {!loaded && <p className="loading-text center">Chargement…</p>}
        {loaded && !profile && <LoginSignupForms onLoggedIn={load} />}
        {loaded && profile && <AccountDashboard profile={profile} onUpdated={load} />}

        {loaded && !profile && (
          <p className="section-lead center" style={{ marginTop: 16 }}>
            Vous préférez réserver sans compte ? <Link to="/booking">Prendre rendez-vous</Link>
          </p>
        )}
      </div>
    </section>
  );
}
