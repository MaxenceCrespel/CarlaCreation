import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useSeo } from '../hooks/useSeo';

// Landing page of the link emailed at signup. Verifying also logs the
// client in, then sends them to their account.
export default function VerifyEmail() {
  useSeo({ title: "Confirmation de l'email", path: '/verification-email', noindex: true });
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const showToast = useToast();
  const [state, setState] = useState(token ? 'loading' : 'invalid'); // loading | invalid

  useEffect(() => {
    if (!token) return;
    apiFetch('/client-auth/verify-email', { method: 'POST', body: { token } })
      .then(() => {
        showToast('Adresse confirmée, bienvenue !', 'success');
        navigate('/mon-compte', { replace: true });
      })
      .catch(() => setState('invalid'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 520 }}>
        <h1 className="center">Confirmation de l'email</h1>
        {state === 'loading' && <p className="loading-text center">Vérification en cours…</p>}
        {state === 'invalid' && (
          <div className="card" style={{ textAlign: 'center' }}>
            <p>Ce lien est invalide ou a expiré. Connectez-vous pour recevoir un nouveau lien de confirmation.</p>
            <Link to="/mon-compte" className="btn btn-primary">Aller à la connexion</Link>
          </div>
        )}
      </div>
    </section>
  );
}
