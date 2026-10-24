// Remembers the client's own contact details in the browser so they don't
// have to retype them on every visit/booking. Nothing here is sent anywhere
// beyond the browser itself — same idea as normal browser autofill.
const STORAGE_KEY = 'carla-creation-contact';

export function getSavedContact() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      clientName: parsed.clientName || '',
      firstName: parsed.firstName ?? (parsed.clientName || '').trim().split(/\s+/)[0] ?? '',
      lastName: parsed.lastName ?? (parsed.clientName || '').trim().split(/\s+/).slice(1).join(' '),
      clientEmail: parsed.clientEmail || '',
      clientPhone: parsed.clientPhone || '',
    };
  } catch (_) {
    return null;
  }
}

export function saveContact({ clientName, firstName, lastName, clientEmail, clientPhone }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ clientName, firstName, lastName, clientEmail, clientPhone }));
  } catch (_) {
    // localStorage unavailable (private browsing, quota, etc.) — non-critical, ignore.
  }
}
