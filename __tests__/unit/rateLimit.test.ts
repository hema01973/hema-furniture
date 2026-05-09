// __tests__/unit/rateLimit.test.ts
// Unit tests for the Redis-backed rate limiter.
// Redis is mocked so tests run without a real server.

jest.mock('ioredis', () => {
  const store: Record<string, number> = {};
  const expiries: Record<string, number> = {};

  const RedisMock = jest.fn().mockImplementation(() => ({
    status: 'ready',
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    pipeline: jest.fn(() => {
      const ops: Array<[string, ...unknown[]]> = [];
      const pipe = {
        zremrangebyscore: (...args: unknown[]) => { ops.push(['zremrangebyscore', ...args]); return pipe; },
        zadd:             (...args: unknown[]) => { ops.push(['zadd', ...args]); return pipe; },
        zcard:            (...args: unknown[]) => { ops.push(['zcard', ...args]); return pipe; },
        expire:           (...args: unknown[]) => { ops.push(['expire', ...args]); return pipe; },
        exec: jest.fn(async () => {
          const key = ops[0][1] as string;
          // Simulate zadd
          store[key] = (store[key] ?? 0) + 1;
          return [
            [null, 0],                    // ZREMRANGEBYSCORE result
            [null, 0],                    // ZADD result
            [null, store[key] ?? 0],     // ZCARD result
            [null, 1],                    // EXPIRE result
          ];
        }),
      };
      return pipe;
    }),
    disconnect: jest.fn(),
  }));

  return { default: RedisMock };
});

// Reset module cache so the singleton resets between tests
beforeEach(() => { jest.resetModules(); });

describe('rateLimit (Redis path)', () => {
  const originalEnv = process.env;

  beforeAll(() => {
    process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };
  });

  afterAll(() => { process.env = originalEnv; });

  it('allows requests below the limit', async () => {
    const { rateLimit } = await import('../../src/lib/redis');
    const blocked = await rateLimit('192.168.1.1', 5, 60);
    expect(blocked).toBe(false);
  });

  it('blocks when count exceeds max', async () => {
    const { rateLimit } = await import('../../src/lib/redis');

    // Simulate a large request count by calling many times
    let blocked = false;
    for (let i = 0; i < 6; i++) {
      blocked = await rateLimit('10.0.0.1', 5, 60);
    }
    expect(blocked).toBe(true);
  });

  it('uses different counters for different IPs', async () => {
    const { rateLimit } = await import('../../src/lib/redis');
    const resultA = await rateLimit('1.1.1.1', 5, 60);
    const resultB = await rateLimit('2.2.2.2', 5, 60);
    // First request from each IP should never be blocked
    expect(resultA).toBe(false);
    expect(resultB).toBe(false);
  });
});

describe('rateLimit (in-memory fallback)', () => {
  const originalEnv = process.env;

  beforeAll(() => {
    // No REDIS_URL → falls back to in-memory
    process.env = { ...originalEnv };
    delete process.env.REDIS_URL;
  });

  afterAll(() => { process.env = originalEnv; });

  it('allows first request', async () => {
    const { rateLimit } = await import('../../src/lib/redis');
    const blocked = await rateLimit('172.0.0.1', 3, 60);
    expect(blocked).toBe(false);
  });

  it('blocks after exceeding limit', async () => {
    const { rateLimit } = await import('../../src/lib/redis');
    for (let i = 0; i < 3; i++) await rateLimit('172.1.1.1', 3, 60);
    const blocked = await rateLimit('172.1.1.1', 3, 60);
    expect(blocked).toBe(true);
  });

  it('resets after window expires', async () => {
    jest.useFakeTimers();
    const { rateLimit } = await import('../../src/lib/redis');

    for (let i = 0; i < 3; i++) await rateLimit('172.2.2.2', 3, 1);
    expect(await rateLimit('172.2.2.2', 3, 1)).toBe(true);

    jest.advanceTimersByTime(2_000); // advance past 1-second window
    expect(await rateLimit('172.2.2.2', 3, 1)).toBe(false);

    jest.useRealTimers();
  });
});
