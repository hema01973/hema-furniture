// __tests__/unit/feature-flags-admin.test.ts — HemaV048
// Tests for the Feature Flags admin UI and runtime toggle logic.

import { getFeatureFlags, setFlag, invalidateFlagCache } from '@/application/feature-flags';

// Mock Redis to isolate from real connections
jest.mock('@/lib/redis', () => ({
  getRedis: jest.fn().mockResolvedValue(null), // Redis unavailable → use defaults
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

describe('FeatureFlags — default values', () => {
  beforeEach(() => {
    invalidateFlagCache();
    // Clear any FEATURE_FLAG_* env overrides
    Object.keys(process.env)
      .filter(k => k.startsWith('FEATURE_FLAG_'))
      .forEach(k => delete process.env[k]);
  });

  it('returns a FeatureFlags instance', async () => {
    const flags = await getFeatureFlags();
    expect(typeof flags.isEnabled).toBe('function');
    expect(typeof flags.getAll).toBe('function');
  });

  it('guest_checkout is enabled by default', async () => {
    const flags = await getFeatureFlags();
    expect(flags.isEnabled('guest_checkout')).toBe(true);
  });

  it('dark_mode is enabled by default', async () => {
    const flags = await getFeatureFlags();
    expect(flags.isEnabled('dark_mode')).toBe(true);
  });

  it('maintenance_mode is disabled by default', async () => {
    const flags = await getFeatureFlags();
    expect(flags.isEnabled('maintenance_mode')).toBe(false);
  });

  it('new_checkout_flow is disabled by default', async () => {
    const flags = await getFeatureFlags();
    expect(flags.isEnabled('new_checkout_flow')).toBe(false);
  });

  it('getAll returns all expected flags', async () => {
    const flags = await getFeatureFlags();
    const all = flags.getAll();
    expect(all).toHaveProperty('guest_checkout');
    expect(all).toHaveProperty('maintenance_mode');
    expect(all).toHaveProperty('dark_mode');
    expect(all).toHaveProperty('new_checkout_flow');
    expect(all).toHaveProperty('fawry_payments');
    expect(all).toHaveProperty('valu_payments');
    expect(all).toHaveProperty('product_compare');
    expect(all).toHaveProperty('ar_product_search');
    expect(all).toHaveProperty('loyalty_program');
    expect(all).toHaveProperty('bulk_order_import');
    expect(all).toHaveProperty('advanced_analytics');
  });

  it('unknown flag returns false', async () => {
    const flags = await getFeatureFlags();
    expect(flags.isEnabled('non_existent_flag' as any)).toBe(false);
  });
});

describe('FeatureFlags — env-var overrides', () => {
  beforeEach(() => invalidateFlagCache());

  afterEach(() => {
    delete process.env.FEATURE_FLAG_MAINTENANCE_MODE;
    delete process.env.FEATURE_FLAG_NEW_CHECKOUT_FLOW;
    invalidateFlagCache();
  });

  it('env var FEATURE_FLAG_MAINTENANCE_MODE=true enables the flag', async () => {
    process.env.FEATURE_FLAG_MAINTENANCE_MODE = 'true';
    const flags = await getFeatureFlags();
    expect(flags.isEnabled('maintenance_mode')).toBe(true);
  });

  it('env var FEATURE_FLAG_NEW_CHECKOUT_FLOW=true enables the flag', async () => {
    process.env.FEATURE_FLAG_NEW_CHECKOUT_FLOW = 'true';
    const flags = await getFeatureFlags();
    expect(flags.isEnabled('new_checkout_flow')).toBe(true);
  });

  it('env var set to false disables an otherwise-default-on flag', async () => {
    process.env.FEATURE_FLAG_DARK_MODE = 'false';
    const flags = await getFeatureFlags();
    expect(flags.isEnabled('dark_mode')).toBe(false);
    delete process.env.FEATURE_FLAG_DARK_MODE;
  });
});

describe('setFlag', () => {
  it('throws when Redis is unavailable', async () => {
    await expect(setFlag('maintenance_mode', true)).rejects.toThrow('Redis not available');
  });
});

describe('invalidateFlagCache', () => {
  it('can be called without throwing', () => {
    expect(() => invalidateFlagCache()).not.toThrow();
  });
});
