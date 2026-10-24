// Inactive accounts (no login for this long) are erased — the CNIL's
// guideline for customer data is 3 years after the last contact.
export const INACTIVITY_YEARS = 3;
// How long before the erasure the warning email goes out.
export const PURGE_WARNING_DAYS = 30;
// A signup that never clicked the verification link is cleaned up after this.
export const UNVERIFIED_SIGNUP_DAYS = 7;

export const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;
