import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ok and an uptime figure when the database answers', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const controller = new HealthController(dataSource as any);

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(typeof result.uptime).toBe('number');
  });

  it('throws ServiceUnavailableException when the database is unreachable', async () => {
    const dataSource = { query: jest.fn().mockRejectedValue(new Error('connection refused')) };
    const controller = new HealthController(dataSource as any);

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
