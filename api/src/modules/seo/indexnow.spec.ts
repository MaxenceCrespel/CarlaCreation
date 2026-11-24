import { INDEXNOW_KEY, indexNowEnabled, indexNowPayload, notifyIndexNow } from './indexnow';

describe('IndexNow', () => {
  it('only runs in production on a real https domain', () => {
    expect(indexNowEnabled('https://carlacreation.fr', true)).toBe(true);
    expect(indexNowEnabled('https://carlacreation.fr', false)).toBe(false);
    expect(indexNowEnabled('http://localhost:3000', true)).toBe(false);
    expect(indexNowEnabled('https://localhost', true)).toBe(false);
  });

  it('lists the public pages of the host with the published key', () => {
    const payload = indexNowPayload('https://carlacreation.fr');
    expect(payload.host).toBe('carlacreation.fr');
    expect(payload.key).toBe(INDEXNOW_KEY);
    expect(payload.keyLocation).toBe(`https://carlacreation.fr/${INDEXNOW_KEY}.txt`);
    expect(payload.urlList).toContain('https://carlacreation.fr/coiffeuse-a-domicile');
    expect(payload.urlList).toHaveLength(7);
  });

  it('never throws, even when the service is unreachable', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    await expect(notifyIndexNow(failing)).resolves.toBeUndefined();
    const refused = jest.fn().mockResolvedValue({ ok: false, status: 403 }) as unknown as typeof fetch;
    await expect(notifyIndexNow(refused)).resolves.toBeUndefined();
  });
});
