import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useSeo } from '../hooks/useSeo';

// Without ?token: asks for the email to send the reset link to.
// With ?token (the emailed link): lets the client pick a new password.
export default function ForgotPassword() {
  useSeo({ title: 'Mot de passe oublié', path: '/mot-de-passe-oublie' });
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const showToast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function requestLink(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/client-auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/client-auth/reset-password', { method: 'POST', body: { token, password } });
      showToast('Mot de passe mis à jour, vous pouvez vous connecter.', 'success');
      navigate('/mon-compte', { replace: true });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 520 }}>
        <h1 className="center">{token ? 'Nouveau mot de passe' : 'Mot de passe oublié'}</h1>
        <div className="card">
          {token ? (
            <form onSubmit={resetPassword}>
              <div className="form-row">
                <label htmlFor="new-password">Nouveau mot de passe (10 caractères minimum)</label>
                <input
                  type="password"
                  id="new-password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
              </button>
            </form>
          ) : sent ? (
            <p>
              Si un compte existe avec l'adresse <strong>{email}</strong>, un lien de réinitialisation vient d'être envoyé
              (valable 1 heure). Pensez à vérifier vos spams.
            </p>
          ) : (
            <form onSubmit={requestLink}>
              <p className="section-lead">Indiquez l'adresse de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
              <div className="form-row">
                <label htmlFor="forgot-email">Email</label>
                <input type="email" id="forgot-email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Envoi…' : 'Envoyer le lien'}
              </button>
            </form>
          )}
        </div>
        <p className="section-lead center" style={{ marginTop: 16 }}>
          <Link to="/mon-compte">Retour à la connexion</Link>
        </p>
      </div>
    </section>
  );
}
