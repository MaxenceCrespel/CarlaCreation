import { useState } from 'react';
import { apiFetch } from '../api/client';
import { useToast } from '../context/ToastContext';
import { clearStoredReferral, getStoredReferral } from '../utils/referralStorage';

// "J'ai un code de parrainage" — for an existing account that isn't sponsored
// yet and has no completed visit (the server re-checks, see
// ClientAuthService.applyReferralCode).
export default function ReferralCodeForm({ onApplied, compact = false }) {
  const showToast = useToast();
  const [code, setCode] = useState(getStoredReferral());
  const [submitting, setSubmitting] = useState(false);

  async function apply(e) {
    e.preventDefault();
    e.stopPropagation();
    setSubmitting(true);
    try {
      await apiFetch('/client-auth/me/referral', { method: 'POST', body: { code } });
      clearStoredReferral();
      showToast('Code de parrainage enregistré : vos 10 points arrivent après votre premier rendez-vous terminé.', 'success');
      onApplied?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={compact ? 'referral-apply is-compact' : 'referral-apply'}>
      <label htmlFor="referral-apply-code">Code de parrainage (optionnel)</label>
      <div className="promo-code-row">
        <input
          type="text"
          id="referral-apply-code"
          maxLength={20}
          placeholder="Ex : ABC234"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            // Inside the booking <form>: Enter must apply the code, not submit the booking.
            if (e.key === 'Enter') {
              e.preventDefault();
              if (code.trim() && !submitting) apply(e);
            }
          }}
        />
        <button type="button" className="btn btn-outline btn-sm" disabled={!code.trim() || submitting} onClick={apply}>
          {submitting ? 'Vérification…' : 'Appliquer'}
        </button>
      </div>
      <p className="form-hint">+10 points pour vous une fois votre premier rendez-vous terminé, +20 pour la personne qui vous parraine.</p>
    </div>
  );
}
