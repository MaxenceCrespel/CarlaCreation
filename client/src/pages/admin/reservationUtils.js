// Shared by the desktop reservations tab and the phone admin (mobile/).

// Service price + addons, minus any promotion discount — the actual total
// the client is paying for this reservation (travel fee shown separately
// elsewhere, since it depends on distance and isn't part of the "formule").
export function reservationTotalCents(r) {
  const addonsSum = (r.addons ?? []).reduce((sum, a) => sum + a.extra_price_cents, 0);
  const fullPrice = r.price_cents + addonsSum;
  return Math.max(0, Math.round(fullPrice * (1 - (r.discount_percent ?? 0) / 100)) - (r.discount_cents ?? 0));
}

export const STATUS_LABELS = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  completed: 'Terminée',
  cancelled: 'Annulée',
  refused: 'Refusée',
};

export const PAYMENT_STATUS_LABELS = {
  pending: 'En attente',
  authorized: 'Autorisé (à encaisser)',
  paid: 'Réglé',
  refunded: 'Remboursé',
  partially_refunded: 'Partiellement remboursé',
  canceled: 'Annulé',
};

export function mapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function wazeUrl(address) {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

// Ce qui demande une action de Carla sur les rendez-vous (écran d'accueil
// bureau et téléphone) :
//  - toComplete : confirmés dont l'heure de fin est passée, jamais marqués
//    « terminés » (les points de fidélité ne sont crédités qu'à ce moment) ;
//  - overdue    : demandes toujours « en attente » alors que le rendez-vous
//    a déjà eu lieu (ou aurait dû) : plus rien à confirmer, à classer ;
//  - toValidate : demandes à venir à confirmer ou refuser.
// `now` est injectable pour les tests.
const pad2 = (n) => String(n).padStart(2, '0');

export function reservationAlerts(list, now = new Date()) {
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const byStart = (a, b) => (a.reservation_date + a.start_time).localeCompare(b.reservation_date + b.start_time);
  const hasEnded = (r) => r.reservation_date < today || (r.reservation_date === today && r.end_time.slice(0, 5) <= time);

  const rows = list ?? [];
  const toComplete = rows.filter((r) => r.status === 'confirmed' && hasEnded(r)).sort(byStart);
  const overdue = rows.filter((r) => r.status === 'pending' && hasEnded(r)).sort(byStart);
  const toValidate = rows.filter((r) => r.status === 'pending' && !hasEnded(r)).sort(byStart);
  return { toComplete, overdue, toValidate };
}
