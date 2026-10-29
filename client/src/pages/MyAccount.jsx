import { useEffect, useState } from 'react';
import PasswordInput from '../components/PasswordInput';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useToast } from '../context/ToastContext';
import { firstError, newPasswordError, phoneError } from '../utils/validate';
import { useSeo } from '../hooks/useSeo';
import { formatPrice } from '../utils/format';
import AccountAuthForms from '../components/AccountAuthForms';
import ReferralCodeForm from '../components/ReferralCodeForm';
import ClientMessages from '../components/ClientMessages';

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

function AccountDashboard({ profile, onUpdated }) {
  const showToast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone, birthdate: profile.birthdate || '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [redeemTier, setRedeemTier] = useState(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [askAbout, setAskAbout] = useState(null); // history row the next message is about

  async function saveProfile(e) {
    e.preventDefault();
    const problem = firstError([[!form.firstName.trim(), 'Indiquez votre prénom.'], [!form.lastName.trim(), 'Indiquez votre nom.'], [!!phoneError(form.phone), phoneError(form.phone)]]);
    if (problem) {
      showToast(problem, 'error');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/client-auth/me', { method: 'PATCH', body: { ...form, birthdate: form.birthdate || undefined } });
      showToast('Profil mis à jour.', 'success');
      setEditing(false);
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    const problem = firstError([
      [!passwordForm.currentPassword, 'Indiquez votre mot de passe actuel.'],
      [!!newPasswordError(passwordForm.newPassword), newPasswordError(passwordForm.newPassword)],
    ]);
    if (problem) {
      showToast(problem, 'error');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/client-auth/me', { method: 'PATCH', body: passwordForm });
      showToast('Mot de passe mis à jour.', 'success');
      setShowPasswordForm(false);
      setPasswordForm({ currentPassword: '', newPassword: '' });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await apiFetch('/client-auth/logout', { method: 'POST' });
    onUpdated();
  }

  const { points, tiers, pointsToNextTier, nextTierPoints } = profile.loyalty;
  // Equal spacing between steps (departure + each tier): the bar reaches a
  // step exactly when the balance reaches it, filling proportionally to the
  // points inside the current segment.
  const stops = [0, ...tiers.map((t) => t.points)];
  const lastIndex = stops.length - 1;
  let segment = 0;
  while (segment < lastIndex && points >= stops[segment + 1]) segment += 1;
  const progress = segment >= lastIndex ? 1 : (segment + (points - stops[segment]) / (stops[segment + 1] - stops[segment])) / lastIndex;
  const referralLink = `${window.location.origin}/mon-compte?parrain=${profile.referral.code}`;

  async function redeem(tierPoints) {
    setSaving(true);
    try {
      const res = await apiFetch('/client-auth/me/redeem', { method: 'POST', body: { points: tierPoints } });
      showToast(`Code ${res.code} créé — il vous a aussi été envoyé par email.`, 'success');
      setRedeemTier(null);
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function exportData() {
    try {
      const data = await apiFetch('/client-auth/me/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mes-donnees.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function deleteAccount(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/client-auth/me', { method: 'DELETE', body: { password: deletePassword } });
      showToast('Votre compte a été supprimé.', 'success');
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function copyReferralLink() {
    try {
      await navigator.clipboard.writeText(referralLink);
      showToast('Lien copié !', 'success');
    } catch {
      showToast(referralLink, 'info');
    }
  }

  return (
    <>
      <div className="card">
        <div className="manual-reservation-form-actions" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Bonjour {profile.firstName}</h2>
          <button type="button" className="admin-logout-btn" onClick={logout} aria-label="Se déconnecter" title="Se déconnecter">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
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
          <form onSubmit={saveProfile} noValidate>
            <div className="form-row two-col">
              <div>
                <label htmlFor="account-firstname">Prénom</label>
                <input type="text" id="account-firstname" required maxLength={100} value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="account-lastname">Nom</label>
                <input type="text" id="account-lastname" required maxLength={100} value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="form-row two-col">
              <div>
                <label htmlFor="account-phone">Téléphone</label>
                <input type="tel" id="account-phone" autoComplete="tel" required value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
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
            <div className="manual-reservation-form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button type="button" className="btn btn-outline" onClick={() => setEditing(false)}>Annuler</button>
            </div>
          </form>
        )}

        {showPasswordForm && (
          <form onSubmit={savePassword} noValidate style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-bg-alt)' }}>
            <div className="form-row">
              <label htmlFor="current-password">Mot de passe actuel</label>
              <PasswordInput
                id="current-password"
                required
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))}
              />
            </div>
            <div className="form-row">
              <label htmlFor="new-password">Nouveau mot de passe (10 caractères minimum)</label>
              <PasswordInput
                id="new-password"
                required
                minLength={10}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Changer le mot de passe'}</button>
          </form>
        )}
      </div>

      <ClientMessages askAbout={askAbout} onClearAsk={() => setAskAbout(null)} />

      <div className="card loyalty-card" style={{ marginTop: 16 }}>
        <div className="loyalty-hero">
          <div>
            <p className="loyalty-hero-eyebrow">Carte de fidélité</p>
            <p className="loyalty-hero-points">
              {points} <span>point{points > 1 ? 's' : ''}</span>
            </p>
          </div>
          <p className="loyalty-hero-hint">
            1 point tous les 4 € dépensés.
            <br />
            {nextTierPoints ? `Encore ${pointsToNextTier} point${pointsToNextTier > 1 ? 's' : ''} avant votre prochain cadeau.` : 'Vous avez atteint le palier maximum !'}
          </p>
        </div>

        <ol className="htl" style={{ '--p': progress }}>
          <li className="htl-track" aria-hidden="true">
            <span className="htl-fill" />
          </li>
          {stops.map((stop, i) => {
            const tier = i === 0 ? null : tiers[i - 1];
            const reached = points >= stop;
            const seg = i === lastIndex ? 0 : Math.max(0, Math.min(1, (points - stop) / (stops[i + 1] - stop)));
            return (
              <li key={stop} className={`htl-step ${reached ? 'is-reached' : ''}`} style={{ '--seg': `${Math.round(seg * 100)}%` }}>
                <span className="htl-dot">{reached ? '✓' : i}</span>
                <div className="htl-label">
                  {tier ? (
                    <>
                      <strong className="htl-reward">{formatPrice(tier.amountCents)} offerts</strong>
                      <span className="htl-pts">{stop} points</span>
                      {tier.affordable ? (
                        <button type="button" className="btn btn-primary btn-sm htl-btn" disabled={saving} onClick={() => setRedeemTier({ points: stop, amountCents: tier.amountCents })}>
                          Échanger
                        </button>
                      ) : (
                        <span className="htl-missing">encore {stop - points} pt{stop - points > 1 ? 's' : ''}</span>
                      )}
                    </>
                  ) : (
                    <>
                      <strong className="htl-reward">Départ</strong>
                      <span className="htl-pts">0 point</span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {redeemTier && (
        <div className="modal-overlay" onClick={() => !saving && setRedeemTier(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="redeem-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="redeem-title">Échanger vos points ?</h2>
            <p>
              <strong>{redeemTier.points} points</strong> seront débités pour obtenir un code de{' '}
              <strong>{formatPrice(redeemTier.amountCents)}</strong>, à usage unique. Cette action est définitive.
            </p>
            <p className="section-lead">Il vous restera {points - redeemTier.points} point{points - redeemTier.points > 1 ? 's' : ''}.</p>
            <button type="button" className="btn btn-primary btn-block" disabled={saving} onClick={() => redeem(redeemTier.points)}>
              {saving ? 'Échange…' : "Confirmer l'échange"}
            </button>
            <button type="button" className="btn btn-outline btn-block" disabled={saving} onClick={() => setRedeemTier(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {profile.codes.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Mes codes</h2>
          <p className="section-lead">À saisir dans le champ « code promo » de la réservation, une seule fois, depuis ce compte.</p>
          {profile.codes.map((c) => (
            <p key={c.code} style={{ margin: '4px 0' }}>
              <strong style={{ letterSpacing: '0.05em' }}>{c.code}</strong> — {c.discount_cents ? `${formatPrice(c.discount_cents)} offerts` : `-${c.discount_percent}%`}
              {c.expires_at ? ` (jusqu'au ${formatDateFr(c.expires_at.slice(0, 10))})` : ''}
            </p>
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Parrainage</h2>
        <p className="section-lead">
          Parrainez une amie : quand son premier rendez-vous est terminé, vous gagnez <strong>20 points</strong> et elle en gagne <strong>10</strong>.
        </p>
        <p>Votre code : <strong style={{ letterSpacing: '0.05em' }}>{profile.referral.code}</strong>
          {profile.referral.validatedCount > 0 && ` — ${profile.referral.validatedCount} parrainage${profile.referral.validatedCount > 1 ? 's' : ''} validé${profile.referral.validatedCount > 1 ? 's' : ''}`}
        </p>
        <button type="button" className="btn btn-outline" onClick={copyReferralLink}>Copier mon lien de parrainage</button>
        {profile.referral.canApplyCode && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-bg-alt)' }}>
            <h3 style={{ margin: '0 0 8px' }}>J'ai un code de parrainage</h3>
            <ReferralCodeForm onApplied={onUpdated} />
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Historique de mes rendez-vous</h2>
        {profile.history.length === 0 ? (
          <p className="loading-text">Aucun rendez-vous pour le moment.</p>
        ) : (
          <ul className="history-list">
            {profile.history.map((h) => (
              <li key={h.id}>
                <div>
                  <strong>{formatDateFr(h.reservation_date)}</strong>
                  <span>{h.service_name} · {h.start_time}</span>
                  {h.status !== 'cancelled' && h.status !== 'refused' && (
                    <button type="button" className="history-ask" onClick={() => setAskAbout(h)}>Poser une question</button>
                  )}
                </div>
                <span className={`status-badge status-${h.status}`}>{STATUS_LABELS[h.status] || h.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Mes données</h2>
        <p className="section-lead">
          Vous pouvez télécharger l'ensemble de vos données ou supprimer votre compte. Sans connexion pendant 3 ans, votre
          compte est supprimé automatiquement.
        </p>
        <div className="account-data-actions">
          <button type="button" className="btn btn-outline" onClick={exportData}>Télécharger mes données</button>
          <button type="button" className="btn btn-outline-danger" onClick={() => setShowDelete(true)}>Supprimer mon compte</button>
        </div>
      </div>

      {showDelete && (
        <div className="modal-overlay" onClick={() => !saving && setShowDelete(false)}>
          <form className="modal-card" role="dialog" aria-modal="true" aria-labelledby="delete-title" onClick={(e) => e.stopPropagation()} onSubmit={deleteAccount}>
            <h2 id="delete-title">Supprimer votre compte ?</h2>
            <p>
              Cette action est <strong>définitive</strong> : votre compte, vos <strong>points de fidélité</strong> et vos codes
              non utilisés seront supprimés, et vos réservations anonymisées. Seules les factures déjà émises sont conservées
              (obligation légale de 10 ans).
            </p>
            <div className="form-row">
              <label htmlFor="delete-password">Confirmez avec votre mot de passe</label>
              <PasswordInput
                id="delete-password"
                required
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-danger btn-block" disabled={saving || !deletePassword}>
              {saving ? 'Suppression…' : 'Supprimer définitivement mon compte'}
            </button>
            <button type="button" className="btn btn-outline btn-block" disabled={saving} onClick={() => setShowDelete(false)}>
              Annuler
            </button>
          </form>
        </div>
      )}
    </>
  );
}

export default function MyAccount() {
  useSeo({ title: 'Mon compte', path: '/mon-compte', noindex: true });
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
        {!profile && <p className="eyebrow center">Mon compte</p>}
        <h1 className="center">{profile ? 'Mon espace' : 'Connexion'}</h1>

        {!loaded && <p className="loading-text center">Chargement…</p>}
        {loaded && !profile && <AccountAuthForms onLoggedIn={load} />}
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
