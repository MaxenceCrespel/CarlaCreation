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
    };
    const controller = new MiscController(settingsService as any);

    const result = await controller.getSiteConfig();

    expect(result.travelFreeRadiusKm).toBeNull();
  });
});
