// __tests__/unit/env-validation.test.ts — strict env schema
describe('Environment validation (strict)', () => {
  const orig = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...orig };
  });

  afterAll(() => { process.env = orig; });

  function loadEnv() {
    const { env } = require('@/lib/env');
    return env;
  }

  it('passes with minimum required vars', () => {
    process.env.MONGODB_URI     = 'mongodb://localhost/test';
    process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
    expect(() => loadEnv()()).not.toThrow();
  });

  it('throws when MONGODB_URI is missing', () => {
    delete process.env.MONGODB_URI;
    process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
    expect(() => loadEnv()()).toThrow(/MONGODB_URI/);
  });

  it('throws when MONGODB_URI is not a MongoDB URI', () => {
    process.env.MONGODB_URI     = 'https://not-mongo.com';
    process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
    expect(() => loadEnv()()).toThrow(/MongoDB URI/);
  });

  it('throws when NEXTAUTH_SECRET is shorter than 32 chars', () => {
    process.env.MONGODB_URI     = 'mongodb://localhost/test';
    process.env.NEXTAUTH_SECRET = 'short';
    expect(() => loadEnv()()).toThrow(/32/);
  });

  it('throws on partial Cloudinary config', () => {
    process.env.MONGODB_URI            = 'mongodb://localhost/test';
    process.env.NEXTAUTH_SECRET        = 'a'.repeat(32);
    process.env.CLOUDINARY_CLOUD_NAME  = 'mycloud'; // only one set
    expect(() => loadEnv()()).toThrow(/Cloudinary/);
  });

  it('passes with full Cloudinary config', () => {
    process.env.MONGODB_URI            = 'mongodb://localhost/test';
    process.env.NEXTAUTH_SECRET        = 'a'.repeat(32);
    process.env.CLOUDINARY_CLOUD_NAME  = 'mycloud';
    process.env.CLOUDINARY_API_KEY     = 'key123';
    process.env.CLOUDINARY_API_SECRET  = 'secret456';
    expect(() => loadEnv()()).not.toThrow();
  });

  it('applies defaults for optional fields', () => {
    process.env.MONGODB_URI     = 'mongodb://localhost/test';
    process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
    const e = loadEnv()();
    expect(e.MONGODB_POOL_SIZE).toBe(10);
    expect(e.RATE_LIMIT_MAX).toBe(100);
    expect(e.LOG_LEVEL).toBe('info');
    expect(e.NODE_ENV).toBe('test');
  });

  it('features flags reflect configured services', () => {
    process.env.MONGODB_URI     = 'mongodb://localhost/test';
    process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
    delete process.env.REDIS_URL;
    delete process.env.CLOUDINARY_API_KEY;
    const { features } = require('@/lib/env');
    expect(features.redis).toBe(false);
    expect(features.cloudinary).toBe(false);
  });
});
