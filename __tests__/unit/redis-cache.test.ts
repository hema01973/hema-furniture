// __tests__/unit/redis-cache.test.ts — typed cache with in-memory fallback
// Runs without a real Redis connection

beforeAll(() => { delete process.env.REDIS_URL; });

describe('cacheGet / cacheSet (in-memory fallback)', () => {
  it('returns null for unknown key', async () => {
    const { cacheGet } = await import('@/lib/redis');
    expect(await cacheGet('nonexistent-key')).toBeNull();
  });

  it('stores and retrieves a value within TTL', async () => {
    const { cacheGet, cacheSet } = await import('@/lib/redis');
    await cacheSet('test:obj', { x: 42 }, 60);
    const result = await cacheGet<{ x: number }>('test:obj');
    expect(result?.x).toBe(42);
  });

  it('returns null after key expires', async () => {
    const { cacheGet, cacheSet } = await import('@/lib/redis');
    await cacheSet('test:expire', 'value', -1); // already expired
    const result = await cacheGet('test:expire');
    expect(result).toBeNull();
  });

  it('deletes a key', async () => {
    const { cacheGet, cacheSet, cacheDel } = await import('@/lib/redis');
    await cacheSet('test:del', 'to-delete', 60);
    await cacheDel('test:del');
    expect(await cacheGet('test:del')).toBeNull();
  });

  it('increments a counter atomically', async () => {
    const { cacheIncr } = await import('@/lib/redis');
    const k  = `test:incr:${Date.now()}`;
    const v1 = await cacheIncr(k, 60);
    const v2 = await cacheIncr(k, 60);
    expect(v1).toBe(1);
    expect(v2).toBe(2);
  });
});

describe('rateLimit (in-memory fallback)', () => {
  it('allows requests under the limit', async () => {
    const { rateLimit } = await import('@/lib/redis');
    const key = `rate:${Date.now()}:allow`;
    expect(await rateLimit(key, 5, 60, false)).toBe(false);
  });

  it('blocks when limit exceeded', async () => {
    const { rateLimit } = await import('@/lib/redis');
    const key = `rate:${Date.now()}:block`;
    for (let i = 0; i < 3; i++) await rateLimit(key, 3, 60, false);
    expect(await rateLimit(key, 3, 60, false)).toBe(true);
  });

  it('failClosed=true with no Redis blocks all requests', async () => {
    process.env.REDIS_URL = 'redis://localhost:9999'; // unreachable
    jest.resetModules();
    const { rateLimit } = await import('@/lib/redis');
    expect(await rateLimit('any', 100, 60, true)).toBe(true);
    delete process.env.REDIS_URL;
  });

  it('failClosed=false with no Redis falls back to in-memory', async () => {
    delete process.env.REDIS_URL;
    jest.resetModules();
    const { rateLimit } = await import('@/lib/redis');
    expect(await rateLimit(`rate:${Date.now()}:soft`, 100, 60, false)).toBe(false);
  });
});
