const sendNotification = jest.fn();
const setVapidDetails = jest.fn();

jest.mock('web-push', () => ({
  setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
  sendNotification: (...args: unknown[]) => sendNotification(...args),
}));
jest.mock('../../config', () => ({
  config: {
    PUSH_ENABLED: true,
    VAPID_PUBLIC_KEY: 'public-key',
    VAPID_PRIVATE_KEY: 'private-key',
    VAPID_SUBJECT: 'mailto:test@example.com',
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PushService } = require('./push.service');

describe('PushService', () => {
  let service: InstanceType<typeof PushService>;
  let subRepo: {
    createQueryBuilder: jest.Mock;
    delete: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(() => {
    sendNotification.mockReset();
    subRepo = {
      createQueryBuilder: jest.fn(),
      delete: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    service = new PushService(subRepo);
  });

  it('configures VAPID details on construction when push is enabled', () => {
    expect(setVapidDetails).toHaveBeenCalledWith('mailto:test@example.com', 'public-key', 'private-key');
  });

  it('getPublicKey returns the configured key', () => {
    expect(service.getPublicKey()).toBe('public-key');
  });

  it('subscribe upserts by endpoint', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const orUpdate = jest.fn().mockReturnValue({ execute });
    const values = jest.fn().mockReturnValue({ orUpdate });
    const insert = jest.fn().mockReturnValue({ values });
    subRepo.createQueryBuilder.mockReturnValue({ insert });

    await service.subscribe(1, { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } });

    expect(values).toHaveBeenCalledWith({ admin_id: 1, endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' });
    expect(orUpdate).toHaveBeenCalledWith(['p256dh', 'auth', 'admin_id'], ['endpoint']);
    expect(execute).toHaveBeenCalled();
  });

  it('unsubscribe deletes scoped to the admin and endpoint', async () => {
    await service.unsubscribe(1, 'https://push.example/abc');
    expect(subRepo.delete).toHaveBeenCalledWith({ admin_id: 1, endpoint: 'https://push.example/abc' });
  });

  it('isSubscribed reflects whether a row exists', async () => {
    subRepo.findOne.mockResolvedValue({ id: 1 });
    await expect(service.isSubscribed(1, 'e')).resolves.toBe(true);

    subRepo.findOne.mockResolvedValue(null);
    await expect(service.isSubscribed(1, 'e')).resolves.toBe(false);
  });

  it('notifyAdmins sends to every stored subscription', async () => {
    subRepo.find.mockResolvedValue([
      { id: 1, endpoint: 'e1', p256dh: 'p1', auth: 'a1' },
      { id: 2, endpoint: 'e2', p256dh: 'p2', auth: 'a2' },
    ]);
    sendNotification.mockResolvedValue(undefined);

    await service.notifyAdmins({ title: 'T', body: 'B' });

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenCalledWith({ endpoint: 'e1', keys: { p256dh: 'p1', auth: 'a1' } }, JSON.stringify({ title: 'T', body: 'B' }));
  });

  it('prunes a subscription that the push service reports as dead (410 Gone)', async () => {
    subRepo.find.mockResolvedValue([{ id: 1, endpoint: 'e1', p256dh: 'p1', auth: 'a1' }]);
    sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));

    await service.notifyAdmins({ title: 'T', body: 'B' });

    expect(subRepo.delete).toHaveBeenCalledWith({ id: 1 });
  });

  it('does not prune a subscription on a transient failure (not 404/410)', async () => {
    subRepo.find.mockResolvedValue([{ id: 1, endpoint: 'e1', p256dh: 'p1', auth: 'a1' }]);
    sendNotification.mockRejectedValue(Object.assign(new Error('network error'), { statusCode: 500 }));

    await service.notifyAdmins({ title: 'T', body: 'B' });

    expect(subRepo.delete).not.toHaveBeenCalled();
  });

  it('never throws even if every subscription fails, so it can never break the booking flow that triggered it', async () => {
    subRepo.find.mockResolvedValue([{ id: 1, endpoint: 'e1', p256dh: 'p1', auth: 'a1' }]);
    sendNotification.mockRejectedValue(new Error('boom'));

    await expect(service.notifyAdmins({ title: 'T', body: 'B' })).resolves.toBeUndefined();
  });
});

describe('PushService — disabled', () => {
  it('notifyAdmins is a no-op and getPublicKey returns null when VAPID keys are unset', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({ config: { PUSH_ENABLED: false, VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', VAPID_SUBJECT: '' } }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PushService: DisabledPushService } = require('./push.service');
    const subRepo = { find: jest.fn() };
    const service = new DisabledPushService(subRepo);

    expect(service.getPublicKey()).toBeNull();
    await service.notifyAdmins({ title: 'T', body: 'B' });
    expect(subRepo.find).not.toHaveBeenCalled();

    jest.dontMock('../../config');
  });
});
