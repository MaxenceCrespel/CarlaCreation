import { freeRadiusKm, resolveTierFee } from './travel-fee.util';

const TIERS = [
  { minKm: 0, feeCents: 0 },
  { minKm: 10, feeCents: 200 },
  { minKm: 25, feeCents: 500 },
];

describe('resolveTierFee', () => {
  it('is free within the first tier', () => {
    expect(resolveTierFee(TIERS, 0)).toBe(0);
    expect(resolveTierFee(TIERS, 9.9)).toBe(0);
  });

  it('applies the exact threshold as the boundary (inclusive)', () => {
    expect(resolveTierFee(TIERS, 10)).toBe(200);
  });

  it('applies the highest tier reached, not cumulative across tiers', () => {
    expect(resolveTierFee(TIERS, 30)).toBe(500);
    expect(resolveTierFee(TIERS, 24.9)).toBe(200);
  });

  it('works regardless of input order', () => {
    const shuffled = [TIERS[2], TIERS[0], TIERS[1]];
    expect(resolveTierFee(shuffled, 15)).toBe(200);
  });
});

describe('freeRadiusKm', () => {
  it('returns the min_km of the first paid tier', () => {
    expect(freeRadiusKm(TIERS)).toBe(10);
  });

  it('returns Infinity when every tier is free', () => {
    expect(freeRadiusKm([{ minKm: 0, feeCents: 0 }])).toBe(Infinity);
  });
});
