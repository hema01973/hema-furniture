// __tests__/unit/enterprise/feature-flags.test.ts — HemaV048
// Tests for the feature flags system

jest.mock('@/lib/redis', () => ({
  getRedis: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Reset module between tests to clear cached state
beforeEach(() => {
  jest.resetModules();
  // Clear env overrides
  Object.keys(process.env).filter(k => k.startsWith('FEATURE_FLAG_')).forEach(k => delete process.env[k]);
});

describe('FeatureFlags', () => {
  test('returns default false for unknown flag', async () => {
    const { getFeatureFlags } = await import('@/application/feature-flags');
    const flags = await getFeatureFlags();
    expect(flags.isEnabled('maintenance_mode' as any)).toBe(false);
  });

  test('env var override works', async () => {
    process.env.FEATURE_FLAG_GUEST_CHECKOUT = 'false';
    const { getFeatureFlags } = await import('@/application/feature-flags');
    const flags = await getFeatureFlags();
    expect(flags.isEnabled('guest_checkout' as any)).toBe(false);
    delete process.env.FEATURE_FLAG_GUEST_CHECKOUT;
  });

  test('getAll returns all flags', async () => {
    const { getFeatureFlags } = await import('@/application/feature-flags');
    const flags = await getFeatureFlags();
    const all = flags.getAll();
    expect(typeof all).toBe('object');
    expect('maintenance_mode' in all).toBe(true);
    expect('dark_mode' in all).toBe(true);
    expect('guest_checkout' in all).toBe(true);
  });

  test('dark_mode is enabled by default', async () => {
    const { getFeatureFlags } = await import('@/application/feature-flags');
    const flags = await getFeatureFlags();
    expect(flags.isEnabled('dark_mode' as any)).toBe(true);
  });

  test('guest_checkout is enabled by default', async () => {
    const { getFeatureFlags } = await import('@/application/feature-flags');
    const flags = await getFeatureFlags();
    expect(flags.isEnabled('guest_checkout' as any)).toBe(true);
  });
});

// __tests__/unit/enterprise/rate-limit.test.ts
describe('RateLimit (in-memory fallback)', () => {
  // Note: These tests exercise the in-memory fallback since Redis is mocked null

  test('allows requests within limit', async () => {
    const { rateLimit, RATE_LIMITS } = await import('@/lib/rate-limit');
    const cfg = { ...RATE_LIMITS.api, max: 3, windowSec: 60 };
    const r1 = await rateLimit('test-ip-1', cfg);
    const r2 = await rateLimit('test-ip-1', cfg);
    const r3 = await rateLimit('test-ip-1', cfg);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r3.success).toBe(true);
  });

  test('blocks requests over limit', async () => {
    const { rateLimit } = await import('@/lib/rate-limit');
    const cfg = { max: 2, windowSec: 60, prefix: 'test-block' };
    await rateLimit('over-limit-ip', cfg);
    await rateLimit('over-limit-ip', cfg);
    const r3 = await rateLimit('over-limit-ip', cfg);
    expect(r3.success).toBe(false);
    expect(r3.remaining).toBe(0);
    expect(r3.retryAfterMs).toBeGreaterThan(0);
  });

  test('different identifiers are independent', async () => {
    const { rateLimit } = await import('@/lib/rate-limit');
    const cfg = { max: 1, windowSec: 60, prefix: 'indep' };
    const r1 = await rateLimit('user-a', cfg);
    const r2 = await rateLimit('user-b', cfg);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });
});

// __tests__/unit/enterprise/audit.test.ts
describe('Audit logger', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    const { logger } = await import('@/lib/logger');
    logSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);
  });

  afterEach(() => logSpy.mockRestore());

  test('audit() calls logger.info with audit=true', async () => {
    const { audit } = await import('@/lib/audit');
    audit('auth.login', { userId: 'u1', ip: '1.2.3.4' });
    expect(logSpy).toHaveBeenCalledWith(
      '[Audit]',
      expect.objectContaining({ audit: true, action: 'auth.login', userId: 'u1' }),
    );
  });

  test('audit() does not throw even when DB is unavailable', async () => {
    const { audit } = await import('@/lib/audit');
    expect(() => audit('auth.login.failed', { ip: '1.2.3.4' })).not.toThrow();
  });

  test('auditAuth convenience wrappers work', async () => {
    const { auditAuth } = await import('@/lib/audit');
    expect(() => auditAuth.login({ userId: 'u2', ip: '1.2.3.4' })).not.toThrow();
    expect(() => auditAuth.loginFailed({ ip: '1.2.3.4' })).not.toThrow();
    expect(() => auditAuth.mfaFailed({ userId: 'u2' })).not.toThrow();
  });
});

// __tests__/unit/enterprise/repository.test.ts
describe('MongoProductRepository interface', () => {
  test('implements required interface methods', async () => {
    const { MongoProductRepository } = await import('@/infrastructure/repositories/MongoProductRepository');
    const repo = new MongoProductRepository();
    expect(typeof repo.findById).toBe('function');
    expect(typeof repo.findBySlug).toBe('function');
    expect(typeof repo.findAll).toBe('function');
    expect(typeof repo.search).toBe('function');
    expect(typeof repo.save).toBe('function');
    expect(typeof repo.delete).toBe('function');
    expect(typeof repo.incrementReviewStats).toBe('function');
    expect(typeof repo.decrementStock).toBe('function');
  });
});
