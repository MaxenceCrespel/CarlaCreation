import { useEffect } from 'react';
import { useToast } from '../context/ToastContext';

// The browser's built-in validation bubbles ("Please use at least 10
// characters") follow the browser's language and can't be styled. This
// intercepts them everywhere (every form on the site, admin included): the
// bubble is cancelled, the first invalid field is focused and the problem is
// shown as a French toast instead.
function fieldLabel(el) {
  const raw = el.labels?.[0]?.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || 'ce champ';
  return raw.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim() || 'ce champ';
}

function messageFor(el) {
  const label = fieldLabel(el);
  const v = el.validity;
  if (v.valueMissing) {
    if (el.type === 'checkbox') return `Merci de cocher « ${label} ».`;
    if (el.tagName === 'SELECT' || el.type === 'radio') return `Merci de faire un choix pour « ${label} ».`;
    return `Merci de renseigner « ${label} ».`;
  }
  if (v.typeMismatch) {
    if (el.type === 'email') return "L'adresse email n'est pas valide (ex. : prenom@gmail.com).";
    if (el.type === 'url') return "L'adresse web n'est pas valide.";
    return `La valeur de « ${label} » n'est pas valide.`;
  }
  if (v.tooShort) return `« ${label} » doit contenir au moins ${el.minLength} caractères.`;
  if (v.tooLong) return `« ${label} » ne peut pas dépasser ${el.maxLength} caractères.`;
  if (v.patternMismatch) return `Le format de « ${label} » n'est pas valide.`;
  if (v.rangeUnderflow) return `« ${label} » doit être supérieur ou égal à ${el.min}.`;
  if (v.rangeOverflow) return `« ${label} » doit être inférieur ou égal à ${el.max}.`;
  if (v.stepMismatch || v.badInput) return `La valeur de « ${label} » n'est pas valide.`;
  return el.validationMessage || `Vérifiez « ${label} ».`;
}

export default function FrenchFormValidation() {
  const showToast = useToast();

  useEffect(() => {
    let last = 0;
    const onInvalid = (e) => {
      e.preventDefault();
      // A submit fires `invalid` on every invalid field at once — only the first one is shown.
      const now = Date.now();
      if (now - last < 150) return;
      last = now;
      const el = e.target;
      showToast(messageFor(el), 'error');
      if (typeof el.focus === 'function') {
        el.focus({ preventScroll: true });
        el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      }
    };
    document.addEventListener('invalid', onInvalid, true);
    return () => document.removeEventListener('invalid', onInvalid, true);
  }, [showToast]);

  return null;
}
