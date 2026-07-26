import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../context/ToastContext';

// Publishes reservations as a subscribable .ics feed (Apple/Google/Outlook
// Calendar can all subscribe to a plain https:// or webcal:// URL) — one
// way only, site → personal calendar. The token in the URL is the auth
// (see api's CalendarFeedController), so regenerating it invalidates
// whatever's currently subscribed until re-added with the new link.
function CalendarSyncCard() {
  const showToast = useToast();
  const [url, setUrl] = useState(undefined); // undefined = loading, null = not generated yet
  const [working, setWorking] = useState(false);

  function load() {
    apiFetch('/admin/calendar-token')
      .then((data) => setUrl(data.url))
      .catch(() => showToast('Impossible de charger le lien de calendrier.', 'error'));
  }

  useEffect(load, []);

  async function generate() {
    if (url && !window.confirm("Régénérer le lien ? L'ancien arrêtera de se mettre à jour dans Apple Calendrier (ou autre) tant qu'il n'est pas remplacé par le nouveau.")) {
      return;
    }
    setWorking(true);
    try {
      const data = await apiFetch('/admin/calendar-token', { method: 'POST' });
      setUrl(data.url);
      showToast('Lien de calendrier généré.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWorking(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Lien copié.', 'success');
    } catch {
      showToast('Impossible de copier automatiquement — sélectionnez le lien manuellement.', 'error');
    }
  }

  return (
    <div className="card">
      <h2>Synchroniser mon calendrier</h2>
      <p className="section-lead">
        Affichez vos rendez-vous dans votre calendrier personnel (Apple Calendrier, Google Agenda, Outlook…). Le
        site reste la seule source des disponibilités — ce lien ne fait que copier vos rendez-vous vers votre
        calendrier perso, pas l'inverse.
      </p>

      {url === undefined && <p className="loading-text">Chargement…</p>}

      {url === null && (
        <button type="button" className="btn btn-primary" onClick={generate} disabled={working}>
          {working ? 'Génération…' : "Générer mon lien d'abonnement"}
        </button>
      )}

      {url && (
        <>
          <div className="calendar-sync-url-row">
            <input type="text" readOnly value={url} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn-outline btn-sm" onClick={copy}>Copier</button>
          </div>
          <p className="form-hint">
            Sur iPhone/Mac : Réglages Calendrier → Comptes → Ajouter un compte → Autre → Calendrier en abonnement,
            puis collez ce lien. Le calendrier se met à jour automatiquement toutes les heures environ (selon
            l'app).
          </p>
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={generate} disabled={working}>
            {working ? 'Génération…' : 'Régénérer le lien'}
          </button>
        </>
      )}
    </div>
  );
}

export default function AccountTab({ username, onCredentialsUpdated }) {
  const showToast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState(username);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);

    const usernameChanged = newUsername.trim() && newUsername.trim() !== username;
    const passwordChanged = newPassword.length > 0;

    if (!usernameChanged && !passwordChanged) {
      setFeedback({ type: 'error', text: "Modifiez le nom d'utilisateur et/ou le mot de passe avant d'enregistrer." });
      return;
    }
    if (passwordChanged && newPassword !== confirmPassword) {
      setFeedback({ type: 'error', text: 'La confirmation ne correspond pas au nouveau mot de passe.' });
      return;
    }
    if (passwordChanged && newPassword.length < 10) {
      setFeedback({ type: 'error', text: 'Le nouveau mot de passe doit faire au moins 10 caractères.' });
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiFetch('/auth/me', {
        method: 'PATCH',
        body: {
          currentPassword,
          newUsername: usernameChanged ? newUsername.trim() : undefined,
          newPassword: passwordChanged ? newPassword : undefined,
        },
      });
      onCredentialsUpdated(data.username);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFeedback({ type: 'success', text: 'Identifiants mis à jour avec succès.' });
      showToast('Identifiants mis à jour.', 'success');
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    <form className="card account-form" noValidate onSubmit={handleSubmit}>
      <h2>Mon compte</h2>
      <p className="section-lead">
        Changez votre identifiant et/ou votre mot de passe. Le mot de passe actuel est toujours requis pour
        confirmer le changement.
      </p>

      <div className="form-row">
        <label htmlFor="account-new-username">Nom d'utilisateur</label>
        <input
          type="text"
          id="account-new-username"
          autoComplete="username"
          minLength={3}
          maxLength={100}
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
        />
      </div>

      <div className="form-row two-col">
        <div>
          <label htmlFor="account-new-password">Nouveau mot de passe (optionnel)</label>
          <input
            type="password"
            id="account-new-password"
            autoComplete="new-password"
            minLength={10}
            placeholder="Laisser vide pour ne pas changer"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="account-confirm-password">Confirmer le nouveau mot de passe</label>
          <input
            type="password"
            id="account-confirm-password"
            autoComplete="new-password"
            minLength={10}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
      </div>

      <div className="form-row">
        <label htmlFor="account-current-password">Mot de passe actuel</label>
        <input
          type="password"
          id="account-current-password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>

      {feedback && (
        <div className={`form-feedback ${feedback.type}`} role="status" aria-live="polite">{feedback.text}</div>
      )}

      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>

    <div style={{ marginTop: 24 }}>
      <CalendarSyncCard />
    </div>
    </>
  );
}
