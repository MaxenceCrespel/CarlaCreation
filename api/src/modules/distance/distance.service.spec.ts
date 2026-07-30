import { Test, TestingModule } from '@nestjs/testing';
import { config } from '../../config';
import { DistanceService } from './distance.service';

describe('DistanceService', () => {
  let service: DistanceService;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DistanceService],
    }).compile();
    service = module.get(DistanceService);

    fetchMock = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (config as { GEOCODING_ENABLED: boolean }).GEOCODING_ENABLED = false;
  });

  it('returns null immediately when geocoding is disabled, without calling fetch', async () => {
    (config as { GEOCODING_ENABLED: boolean }).GEOCODING_ENABLED = false;

    const result = await service.estimate('1 rue A, Lille', '2 rue B, Lille');

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the distance rounded to 0.1km and the duration rounded UP to the nearest 15 minutes', async () => {
    (config as { GEOCODING_ENABLED: boolean }).GEOCODING_ENABLED = true;

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [{ geometry: { coordinates: [3.05, 50.63] } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [{ geometry: { coordinates: [3.1, 50.65] } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ distances: [[8432]], durations: [[842]] }) });

    const result = await service.estimate('Origin', 'Destination');

    // 842s = 14.03 min, rounded UP to the 15-minute grid — never 14, and
    // never anything that would produce an ugly appointment time like 09:22.
    expect(result).toEqual({ distanceKm: 8.4, durationMinutes: 15 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('caches the origin geocode across calls', async () => {
    (config as { GEOCODING_ENABLED: boolean }).GEOCODING_ENABLED = true;

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ geometry: { coordinates: [3.05, 50.63] } }], distances: [[1000]], durations: [[60]] }),
    });

    await service.estimate('Origin', 'Destination A');
    await service.estimate('Origin', 'Destination B');

    // 2 geocode calls (origin cached after the first) + 2 destination
    // geocodes + 2 matrix calls = 5, not 6.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('returns null when the destination address cannot be geocoded', async () => {
    (config as { GEOCODING_ENABLED: boolean }).GEOCODING_ENABLED = true;

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [{ geometry: { coordinates: [3.05, 50.63] } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [] }) });

    const result = await service.estimate('Origin', 'Somewhere unknown');

    expect(result).toBeNull();
  });

  it('returns null instead of throwing when the API request fails', async () => {
    (config as { GEOCODING_ENABLED: boolean }).GEOCODING_ENABLED = true;
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await service.estimate('Origin', 'Destination');

    expect(result).toBeNull();
  });

  it('returns null when the matrix API response is malformed', async () => {
    (config as { GEOCODING_ENABLED: boolean }).GEOCODING_ENABLED = true;

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [{ geometry: { coordinates: [3.05, 50.63] } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [{ geometry: { coordinates: [3.1, 50.65] } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const result = await service.estimate('Origin', 'Destination');

    expect(result).toBeNull();
  });
});
