// Client-side checks with French messages, shown as toasts: the browser's own
// validation bubbles ("Please use at least 10 characters") follow the browser's
// language and can't be styled, so forms using these are marked noValidate.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD_LENGTH = 10;

// First failing rule's message, or null. rules: [[isInvalid, message], ...]
export function firstError(rules) {
  const failing = rules.find(([invalid]) => invalid);
  return failing ? failing[1] : null;
}

export const emailError = (value) =>
  !value.trim() ? 'Indiquez votre adresse email.' : !EMAIL_RE.test(value.trim()) ? "Vérifiez l'adresse email (ex. : prenom@gmail.com)." : null;

export const newPasswordError = (value) =>
  value.length < MIN_PASSWORD_LENGTH ? `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` : null;
