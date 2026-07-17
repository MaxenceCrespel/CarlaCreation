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
      clientEmail: parsed.clientEmail || '',
      clientPhone: parsed.clientPhone || '',
    };
  } catch (_) {
    return null;
  }
}

export function saveContact({ clientName, clientEmail, clientPhone }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ clientName, clientEmail, clientPhone }));
  } catch (_) {
    // localStorage unavailable (private browsing, quota, etc.) — non-critical, ignore.
  }
}
