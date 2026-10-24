import { useState } from 'react';
import PasswordInput from './PasswordInput';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useToast } from '../context/ToastContext';
import { emailError, firstError, newPasswordError, phoneError } from '../utils/validate';
import { clearStoredReferral, getStoredReferral } from '../utils/referralStorage';

const EMPTY_SIGNUP = { firstName: '', lastName: '', email: '', phone: '', password: '', birthdate: '', referralCode: '' };
const EMPTY_LOGIN = { email: '', password: '' };

export default function AccountAuthForms({ onLoggedIn }) {
  const showToast = useToast();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(searchParams.get('parrain') || getStoredReferral() ? 'signup' : 'login'); // 'login' | 'signup'
  const [loginForm, setLoginForm] = useState(EMPTY_LOGIN);
  const [signupForm, setSignupForm] = useState({ ...EMPTY_SIGNUP, referralCode: (searchParams.get('parrain') || getStoredReferral()).toUpperCase() });
  const [submitting, setSubmitting] = useState(false);
  // Email awaiting verification (after signup, or a login attempt before the link was clicked).
  const [pendingEmail, setPendingEmail] = useState(null);

  async function handleLogin(e) {
    e.preventDefault();
    const problem = firstError([[!!emailError(loginForm.email), emailError(loginForm.email)], [!loginForm.password, 'Indiquez votre mot de passe.']]);
    if (problem) {
      showToast(problem, 'error');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/client-auth/login', { method: 'POST', body: loginForm });
      onLoggedIn();
    } catch (err) {
      if (err.code === 'EMAIL_NOT_VERIFIED') setPendingEmail(loginForm.email.trim());
      else showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function resendVerification() {
    try {
      await apiFetch('/client-auth/resend-verification', { method: 'POST', body: { email: pendingEmail } });
      showToast('Email renvoyé — pensez à vérifier vos spams.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    const problem = firstError([
      [!signupForm.firstName.trim(), 'Indiquez votre prénom.'],
      [!signupForm.lastName.trim(), 'Indiquez votre nom.'],
      [!!emailError(signupForm.email), emailError(signupForm.email)],
      [!!phoneError(signupForm.phone), phoneError(signupForm.phone)],
      [!!newPasswordError(signupForm.password), newPasswordError(signupForm.password)],
    ]);
    if (problem) {
      showToast(problem, 'error');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/client-auth/signup', {
        method: 'POST',
        body: { ...signupForm, birthdate: signupForm.birthdate || undefined, referralCode: signupForm.referralCode.trim() || undefined },
      });
      clearStoredReferral();
      setPendingEmail(signupForm.email.trim());
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (pendingEmail) {
    return (
      <div className="card verify-pending">
        <div className="verify-pending-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
        </div>
        <h2>Vérifiez votre boîte mail</h2>
        <p>
          Un lien de confirmation a été envoyé à <strong>{pendingEmail}</strong>. Cliquez dessus pour activer votre compte
          (valable 24 heures), puis connectez-vous.
        </p>
        <div className="verify-pending-actions">
          <button type="button" className="btn btn-outline" onClick={resendVerification}>Renvoyer l'email</button>
          <button type="button" className="btn btn-outline" onClick={() => { setPendingEmail(null); setMode('login'); }}>
            Changer d'adresse
          </button>
        </div>
      </div>
    );
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
        <form onSubmit={handleLogin} noValidate>
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
            <PasswordInput
              id="login-password"
              required
              value={loginForm.password}
              onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Connexion…' : 'Se connecter'}
          </button>
          <p className="form-hint" style={{ marginTop: 12 }}>
            <Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
          </p>
        </form>
      ) : (
        <form onSubmit={handleSignup} noValidate>
          <div className="form-row two-col">
            <div>
              <label htmlFor="signup-firstname">Prénom</label>
              <input
                type="text"
                id="signup-firstname"
                autoComplete="given-name"
                required
                maxLength={100}
                value={signupForm.firstName}
                onChange={(e) => setSignupForm((f) => ({ ...f, firstName: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="signup-lastname">Nom</label>
              <input
                type="text"
                id="signup-lastname"
                autoComplete="family-name"
                required
                maxLength={100}
                value={signupForm.lastName}
                onChange={(e) => setSignupForm((f) => ({ ...f, lastName: e.target.value }))}
              />
            </div>
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
              <label htmlFor="signup-phone">Téléphone</label>
              <input
                type="tel"
                id="signup-phone"
                autoComplete="tel"
                required
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
            <PasswordInput
              id="signup-password"
              required
              minLength={10}
              value={signupForm.password}
              onChange={(e) => setSignupForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <label htmlFor="signup-referral">Code de parrainage (optionnel)</label>
            <input
              type="text"
              id="signup-referral"
              maxLength={20}
              value={signupForm.referralCode}
              onChange={(e) => setSignupForm((f) => ({ ...f, referralCode: e.target.value.toUpperCase() }))}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>
      )}
    </div>
  );
}

