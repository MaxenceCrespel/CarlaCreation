// Date/format helpers shared by the phone admin screens. Dates are handled
// as local 'YYYY-MM-DD' strings, like the API returns them — never through
// toISOString(), which would shift late-evening dates to the next day (UTC).

export const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
export const DAY_SHORT = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
export const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

// Monday-first index (0 = lundi … 6 = dimanche), like a French calendar.
export function mondayIndex(s) {
  return (parseDate(s).getDay() + 6) % 7;
}

export function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// "Mercredi 28 octobre"
export function formatDayLong(s) {
  const d = parseDate(s);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

// "Mer. 28 oct."
export function formatDayShort(s) {
  const d = parseDate(s);
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

// "Aujourd'hui" / "Demain" / "Hier", else "Mer. 28 oct."
export function relativeDay(s) {
  const today = todayStr();
  if (s === today) return "Aujourd'hui";
  if (s === addDays(today, 1)) return 'Demain';
  if (s === addDays(today, -1)) return 'Hier';
  return formatDayShort(s);
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${capitalize(MONTH_NAMES[m - 1])} ${y}`;
}

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function toMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function fromMinutes(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// '09:00' -> '9h', '13:30' -> '13h30'
export function shortTime(t) {
  const [h, m] = t.split(':');
  return `${Number(h)}h${m && m !== '00' ? m : ''}`;
}

export function rangesLabel(ranges) {
  return ranges.map((r) => `${shortTime(r.openTime)}–${shortTime(r.closeTime)}`).join(' · ');
}

export function initials(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

export function telHref(phone) {
  return `tel:${(phone || '').replace(/[^\d+]/g, '')}`;
}

export function smsHref(phone) {
  return `sms:${(phone || '').replace(/[^\d+]/g, '')}`;
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

// Reservation status → badge tone (see .m-badge-* in admin-mobile.css).
export const STATUS_TONE = {
  pending: 'wait',
  confirmed: 'ok',
  completed: 'info',
  cancelled: 'ko',
  refused: 'ko',
};

export const ACTIVE_STATUSES = ['pending', 'confirmed', 'completed'];

// The category tree is at most one level deep (see ServicesTab): returns
// each top-level category followed by its children, with a depth flag.
export function orderedCategoryTree(categories) {
  const topLevel = categories.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const result = [];
  for (const top of topLevel) {
    result.push({ ...top, depth: 0 });
    categories
      .filter((c) => c.parent_id === top.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((child) => result.push({ ...child, depth: 1 }));
  }
  return result;
}

export function topLevelOf(categories, categoryId) {
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return null;
  return cat.parent_id ? cat.parent_id : cat.id;
}
