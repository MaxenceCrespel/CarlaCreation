import { CENTS_PER_POINT, REWARD_TIERS } from './loyalty.constants';

/** Points de fidélité gagnés pour une prestation payée (montant après remises). */
export function pointsForPrestation(paidCents: number, travelFeeCents: number): number {
  const total = paidCents + travelFeeCents;
  return Math.round(total / CENTS_PER_POINT);
}

/** Meilleur palier de récompense que la cliente peut débloquer avec son solde de points. */
export function bestRedeemableTier(
  points: number,
): { points: number; amountCents: number } | null {
  return REWARD_TIERS.find((tier) => points >= tier.points) ?? null;
}
