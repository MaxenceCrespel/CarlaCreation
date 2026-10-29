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
