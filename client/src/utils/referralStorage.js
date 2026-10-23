// A sponsor's code arrives as ?parrain=CODE on any page. It's remembered so a
// visitor who books as a guest (or browses first) can still use it when they
// create an account later. Storage can be blocked — never let that throw.
const KEY = 'carla_referral_code';

export function getStoredReferral() {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function storeReferral(code) {
  try {
    localStorage.setItem(KEY, code.trim().toUpperCase().slice(0, 20));
  } catch {
    // storage unavailable — the code just isn't remembered
  }
}

export function clearStoredReferral() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
