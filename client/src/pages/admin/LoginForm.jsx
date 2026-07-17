import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api/client';

export default function LoginForm({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      const data = await apiFetch('/auth/login', { method: 'POST', body: { username, password } });
      onLoggedIn(data.username);
    } catch (err) {
      setFeedback(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-login-wrap">
      <form className="card admin-login-card" noValidate onSubmit={handleSubmit}>
        <h1>Espace administrateur</h1>
        <p className="section-lead">Connectez-vous pour gérer le site de Carla Création.</p>
        <div className="form-row">
          <label htmlFor="username">Identifiant</label>
          <input type="text" id="username" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="password">Mot de passe</label>
          <input type="password" id="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {feedback && (
          <div className="form-feedback error" role="status" aria-live="polite">{feedback}</div>
        )}
        <button type="submit" className="btn btn-primary btn-block form-actions" disabled={submitting}>
          {submitting ? 'Connexion…' : 'Se connecter'}
        </button>
        <p className="admin-back"><Link to="/">&larr; Retour au site</Link></p>
      </form>
    </div>
  );
}
