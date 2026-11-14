import { MiscController } from './misc.controller';

describe('MiscController', () => {
  it('csrfToken just confirms the cookie-issuing middleware ran', () => {
    const controller = new MiscController({} as any);
    expect(controller.csrfToken()).toEqual({ ok: true });
  });

  it('getSiteConfig exposes the public config but never the studio address', async () => {
    const settingsService = {
      getTravelFeeTiers: jest.fn().mockResolvedValue([{ minKm: 0, feeCents: 0 }]),
      getTravelFeeFallbackCents: jest.fn().mockResolvedValue(200),
      getBirthdayDiscountPercent: jest.fn().mockResolvedValue(10),
    };
    const controller = new MiscController(settingsService as any);

    const result = await controller.getSiteConfig();

    expect(result.siteName).toBe('Carla Création');
    expect(result).not.toHaveProperty('siteAddress');
    expect(result.travelFeeFallbackCents).toBe(200);
  });

  it('getSiteConfig reports no free-travel radius as null (never Infinity, invalid JSON)', async () => {
    const settingsService = {
      // No tier ever charges a fee — freeRadiusKm resolves to Infinity.
      getTravelFeeTiers: jest.fn().mockResolvedValue([{ minKm: 0, feeCents: 0 }]),
      getTravelFeeFallbackCents: jest.fn().mockResolvedValue(0),
      getBirthdayDiscountPercent: jest.fn().mockResolvedValue(10),
    };
    const controller = new MiscController(settingsService as any);

    const result = await controller.getSiteConfig();

    expect(result.travelFreeRadiusKm).toBeNull();
  });

  it('getSiteConfig reports Stripe as disabled when no keys are configured', async () => {
    const settingsService = {
      getTravelFeeTiers: jest.fn().mockResolvedValue([{ minKm: 0, feeCents: 0 }]),
      getTravelFeeFallbackCents: jest.fn().mockResolvedValue(200),
      getBirthdayDiscountPercent: jest.fn().mockResolvedValue(10),
    };
    const controller = new MiscController(settingsService as any);

    const result = await controller.getSiteConfig();

    // No STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET in the test environment.
    expect(result.stripeEnabled).toBe(false);
  });

  it('getSiteConfig exposes the real loyalty rules for the public pages', async () => {
    const settingsService = {
      getTravelFeeTiers: jest.fn().mockResolvedValue([{ minKm: 0, feeCents: 0 }]),
      getTravelFeeFallbackCents: jest.fn().mockResolvedValue(200),
      getBirthdayDiscountPercent: jest.fn().mockResolvedValue(15),
    };
    const controller = new MiscController(settingsService as any);

    const { loyalty } = await controller.getSiteConfig();

    expect(loyalty.centsPerPoint).toBe(400);
    expect(loyalty.tiers[0]).toEqual({ points: 50, amountCents: 500 });
    expect(loyalty.referralSponsorPoints).toBe(20);
    expect(loyalty.referralRefereePoints).toBe(10);
    expect(loyalty.birthdayDiscountPercent).toBe(15);
  });
});
