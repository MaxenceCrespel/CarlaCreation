// A guest's own rate ("tarif étudiant", a percentage) and an order-wide promo
// code stack: the code applies to what is left after the rate. Both sides
// (booking page and server) use this exact rounding so the price shown is
// the price charged.
export function combinePercents(ratePercent: number, codePercent: number): number {
  return Math.round(100 * (1 - (1 - ratePercent / 100) * (1 - codePercent / 100)));
}
