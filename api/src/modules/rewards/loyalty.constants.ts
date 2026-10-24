// 1 point per full 4 € of prestation (after discounts, travel fee excluded).
export const CENTS_PER_POINT = 400;

// Points redeemable for a single-use euro code. Order matters (ascending).
export const REWARD_TIERS: { points: number; amountCents: number }[] = [
  { points: 50, amountCents: 500 },
  { points: 100, amountCents: 1200 },
  { points: 150, amountCents: 2000 },
  { points: 250, amountCents: 3500 },
];

// Granted once the referee's first reservation is marked completed.
export const REFERRAL_SPONSOR_POINTS = 20;
export const REFERRAL_REFEREE_POINTS = 10;

export const BIRTHDAY_CODE_VALID_MONTHS = 1;
