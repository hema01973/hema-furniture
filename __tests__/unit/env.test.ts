describe('Environment validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => { process.env = originalEnv; });

  it('throws on missing MONGODB_URI', () => {
    delete process.env.MONGODB_URI;
    process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { env } = require('@/lib/env');
      env();
    }).toThrow(/MONGODB_URI/);
  });

  it('throws on short NEXTAUTH_SECRET', () => {
    process.env.MONGODB_URI = 'mongodb://localhost/test';
    process.env.NEXTAUTH_SECRET = 'short';
    expect(() => {
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { env } = require('@/lib/env');
      env();
    }).toThrow(/NEXTAUTH_SECRET/);
  });

  it('returns defaults for optional fields', () => {
    process.env.MONGODB_URI     = 'mongodb://localhost/test';
    process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require('@/lib/env');
    const e = env();
    expect(e.MONGODB_POOL_SIZE).toBe(10);
    expect(e.RATE_LIMIT_MAX).toBe(100);
    expect(e.LOG_LEVEL).toBe('info');
  });
});
