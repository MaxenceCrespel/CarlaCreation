import { useState } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../context/ToastContext';

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
  );
}
