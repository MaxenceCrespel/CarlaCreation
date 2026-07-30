export interface TravelFeeTierValue {
  minKm: number;
  feeCents: number;
}

// Step function, not cumulative: the fee is whichever tier's min_km is the
// largest one still at or below the actual distance. A min_km=0 tier is
// assumed present (SettingsService.setTravelFeeTiers enforces it) so this
// always resolves to a real fee.
export function resolveTierFee(tiers: TravelFeeTierValue[], distanceKm: number): number {
  const sorted = [...tiers].sort((a, b) => a.minKm - b.minKm);
  let fee = 0;
  for (const tier of sorted) {
    if (distanceKm >= tier.minKm) {
      fee = tier.feeCents;
    } else {
      break;
    }
  }
  return fee;
}

// The distance at which fees start applying — shown to clients before they
// even enter their address ("beyond Xkm, travel fees may apply"). Infinity
// if every tier is free (no surprise ever possible).
export function freeRadiusKm(tiers: TravelFeeTierValue[]): number {
  const sorted = [...tiers].sort((a, b) => a.minKm - b.minKm);
  const firstPaid = sorted.find((t) => t.feeCents > 0);
  return firstPaid ? firstPaid.minKm : Infinity;
}
