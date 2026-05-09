// __tests__/integration/rate-limit.test.ts
import { rateLimit } from '@/lib/redis';

describe('rateLimit (in-memory fallback)', () => {
  // Force in-memory path by not setting REDIS_URL
  const originalRedis = process.env.REDIS_URL;
  beforeAll(() => { delete process.env.REDIS_URL; });
  afterAll(() => { process.env.REDIS_URL = originalRedis; });

  it('allows requests under the limit', async () => {
    const ip = `test-ip-${Date.now()}-allow`;
    const blocked = await rateLimit(ip, 5, 60, false);
    expect(blocked).toBe(false);
  });

  it('blocks when limit is exceeded', async () => {
    const ip = `test-ip-${Date.now()}-block`;
    for (let i = 0; i < 3; i++) await rateLimit(ip, 3, 60, false);
    const blocked = await rateLimit(ip, 3, 60, false);
    expect(blocked).toBe(true);
  });

  it('failClosed=true with no Redis blocks all requests', async () => {
    process.env.REDIS_URL = 'redis://localhost:9999'; // unreachable
    jest.resetModules();
    const { rateLimit: rl } = await import('@/lib/redis');
    const blocked = await rl('any-ip', 100, 60, true);
    expect(blocked).toBe(true);
    delete process.env.REDIS_URL;
  });
});
