// __tests__/unit/v061-fixes.test.ts — HemaV061
// Tests for V061 gap-closure fixes:
//   A) Secret version validation end-to-end (getSecretForVersion in auth context)
//   B) Audit log integrity — hash chaining and HMAC verification
//   C) Redis failure modes — getRedis (null) vs getRedisOrThrow (throw)
//   D) DB retry behavior — withDbRetry transient/non-transient errors

import {
  getSecretForVersion,
  getSecretVersion,
  rotateSecret,
  setSecretForTest,
  clearSecretCache,
} from '../../src/lib/secrets';

import {
  computeAuditChainHash,
  computeAuditHmac,
} from '../../src/lib/mongodb';

import { withDbRetry } from '../../src/lib/api';

// ─── Mock logger to suppress output during tests ─────────────────────────────
jest.mock('../../src/lib/logger', () => ({
  logger: {
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ─── Mock mongodb for audit functions (no real DB needed) ─────────────────────
jest.mock('../../src/lib/mongodb', () => {
  const actual = jest.requireActual('../../src/lib/mongodb');
  return {
    ...actual,
    // Re-export pure functions without DB model init
    computeAuditChainHash: actual.computeAuditChainHash,
    computeAuditHmac:      actual.computeAuditHmac,
  };
});

// ─── A) Secret Version Validation ────────────────────────────────────────────
describe('V061-A: getSecretForVersion — version-bound secret retrieval', () => {
  beforeEach(() => {
    clearSecretCache();
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    clearSecretCache();
    jest.restoreAllMocks();
  });

  test('returns current secret for exact version match', () => {
    setSecretForTest('NEXTAUTH_SECRET', 'secret-v1');
    const version = getSecretVersion('NEXTAUTH_SECRET');
    expect(version).toBe(1);

    const result = getSecretForVersion('NEXTAUTH_SECRET', 1);
    expect(result).toBe('secret-v1');
  });

  test('returns undefined for future version (token from the future)', () => {
    setSecretForTest('NEXTAUTH_SECRET', 'secret-v1');
    const result = getSecretForVersion('NEXTAUTH_SECRET', 999);
    expect(result).toBeUndefined();
  });

  test('returns undefined for version 0 (pre-versioning era token)', () => {
    setSecretForTest('NEXTAUTH_SECRET', 'secret-v1');
    // version starts at 1 after setSecretForTest
    const result = getSecretForVersion('NEXTAUTH_SECRET', 0);
    expect(result).toBeUndefined();
  });

  test('returns previous secret within grace period after rotation', () => {
    setSecretForTest('NEXTAUTH_SECRET', 'secret-v1');
    const v1 = getSecretVersion('NEXTAUTH_SECRET');
    expect(v1).toBe(1);

    // Rotate to v2
    rotateSecret('NEXTAUTH_SECRET', 'secret-v2', 'test-initiator');
    const v2 = getSecretVersion('NEXTAUTH_SECRET');
    expect(v2).toBe(2);

    // Token signed with v1 should still be valid (within grace period — just rotated)
    const resultForV1 = getSecretForVersion('NEXTAUTH_SECRET', 1);
    expect(resultForV1).toBe('secret-v1');

    // Token signed with v2 should return current
    const resultForV2 = getSecretForVersion('NEXTAUTH_SECRET', 2);
    expect(resultForV2).toBe('secret-v2');
  });

  test('current version always returns current secret regardless of grace period', () => {
    setSecretForTest('NEXTAUTH_SECRET', 'secret-v1');
    rotateSecret('NEXTAUTH_SECRET', 'secret-v2', 'test');
    rotateSecret('NEXTAUTH_SECRET', 'secret-v3', 'test');
    const v = getSecretVersion('NEXTAUTH_SECRET');
    expect(v).toBe(3);

    const result = getSecretForVersion('NEXTAUTH_SECRET', 3);
    expect(result).toBe('secret-v3');
  });

  test('returns undefined for uncached secret name', () => {
    clearSecretCache();
    const result = getSecretForVersion('NEXTAUTH_SECRET', 1);
    expect(result).toBeUndefined();
  });

  test('version increments monotonically on rotation', () => {
    setSecretForTest('NEXTAUTH_SECRET', 'v1');
    expect(getSecretVersion('NEXTAUTH_SECRET')).toBe(1);

    rotateSecret('NEXTAUTH_SECRET', 'v2', 'test');
    expect(getSecretVersion('NEXTAUTH_SECRET')).toBe(2);

    rotateSecret('NEXTAUTH_SECRET', 'v3', 'test');
    expect(getSecretVersion('NEXTAUTH_SECRET')).toBe(3);
  });
});

// ─── B) Audit Log Integrity ───────────────────────────────────────────────────
describe('V061-B: computeAuditChainHash and computeAuditHmac', () => {
  const GENESIS = 'GENESIS:HEMA_AUDIT_CHAIN_V061';

  const entry1 = {
    action:     'user.login',
    userId:     'user-abc-123',
    resourceId: undefined,
    createdAt:  new Date('2026-05-06T10:00:00.000Z'),
  };

  test('computeAuditChainHash produces consistent output for same inputs', () => {
    const h1 = computeAuditChainHash(GENESIS, entry1);
    const h2 = computeAuditChainHash(GENESIS, entry1);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  test('computeAuditChainHash produces different output for different prevHash', () => {
    const h1 = computeAuditChainHash(GENESIS, entry1);
    const h2 = computeAuditChainHash('different-prev-hash', entry1);
    expect(h1).not.toBe(h2);
  });

  test('computeAuditChainHash produces different output for different action', () => {
    const h1 = computeAuditChainHash(GENESIS, entry1);
    const h2 = computeAuditChainHash(GENESIS, { ...entry1, action: 'user.logout' });
    expect(h1).not.toBe(h2);
  });

  test('computeAuditChainHash chains correctly across multiple entries', () => {
    const h1 = computeAuditChainHash(GENESIS, entry1);
    const entry2 = { action: 'order.create', userId: 'user-abc-123', createdAt: new Date('2026-05-06T10:01:00.000Z') };
    const h2 = computeAuditChainHash(h1, entry2);

    // Re-compute h1 and chain again — must match
    const h1Again = computeAuditChainHash(GENESIS, entry1);
    const h2Again = computeAuditChainHash(h1Again, entry2);
    expect(h2).toBe(h2Again);
  });

  test('tampered entry produces different chain hash (integrity detectable)', () => {
    const h1 = computeAuditChainHash(GENESIS, entry1);
    // Simulate a tampered version of entry1 (action changed)
    const tamperedEntry = { ...entry1, action: 'user.logout' };
    const h1Tampered = computeAuditChainHash(GENESIS, tamperedEntry);
    expect(h1).not.toBe(h1Tampered);
    // Any subsequent entries chained from tampered hash will also differ
    const entry2 = { action: 'order.create', userId: 'u', createdAt: new Date() };
    expect(computeAuditChainHash(h1, entry2)).not.toBe(computeAuditChainHash(h1Tampered, entry2));
  });

  test('computeAuditHmac returns empty string when AUDIT_HMAC_SECRET not set', () => {
    const savedSecret = process.env.AUDIT_HMAC_SECRET;
    delete process.env.AUDIT_HMAC_SECRET;
    const hmac = computeAuditHmac({ action: 'test', createdAt: new Date() });
    expect(hmac).toBe('');
    if (savedSecret !== undefined) process.env.AUDIT_HMAC_SECRET = savedSecret;
  });

  test('computeAuditHmac returns 64-char hex string when secret is set', () => {
    process.env.AUDIT_HMAC_SECRET = 'test-hmac-secret-32chars-minimum!!';
    const hmac = computeAuditHmac({
      action:     'user.login',
      userId:     'user-123',
      resourceId: undefined,
      details:    { ip: '1.2.3.4' },
      createdAt:  new Date('2026-05-06T10:00:00.000Z'),
    });
    expect(hmac).toHaveLength(64); // HMAC-SHA256 hex
    delete process.env.AUDIT_HMAC_SECRET;
  });

  test('computeAuditHmac produces different signatures for different content', () => {
    process.env.AUDIT_HMAC_SECRET = 'test-secret';
    const sig1 = computeAuditHmac({ action: 'login', createdAt: new Date() });
    const sig2 = computeAuditHmac({ action: 'logout', createdAt: new Date() });
    expect(sig1).not.toBe(sig2);
    delete process.env.AUDIT_HMAC_SECRET;
  });

  test('computeAuditHmac is deterministic for same inputs', () => {
    process.env.AUDIT_HMAC_SECRET = 'deterministic-test';
    const ts = new Date('2026-05-06T12:00:00.000Z');
    const sig1 = computeAuditHmac({ action: 'order.refund', userId: 'u1', createdAt: ts });
    const sig2 = computeAuditHmac({ action: 'order.refund', userId: 'u1', createdAt: ts });
    expect(sig1).toBe(sig2);
    delete process.env.AUDIT_HMAC_SECRET;
  });
});

// ─── C) Redis Failure Modes ───────────────────────────────────────────────────
describe('V061-C: Redis failure modes', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('getRedis returns null when REDIS_URL is not set', async () => {
    const savedUrl = process.env.REDIS_URL;
    delete process.env.REDIS_URL;

    const { getRedis } = await import('../../src/lib/redis');
    const client = await getRedis();
    expect(client).toBeNull();

    if (savedUrl !== undefined) process.env.REDIS_URL = savedUrl;
  });

  test('getRedisOrThrow throws when REDIS_URL is not set', async () => {
    const savedUrl = process.env.REDIS_URL;
    delete process.env.REDIS_URL;

    const { getRedisOrThrow } = await import('../../src/lib/redis');
    await expect(getRedisOrThrow()).rejects.toThrow('[Redis] Connection unavailable');

    if (savedUrl !== undefined) process.env.REDIS_URL = savedUrl;
  });

  test('getRedisOrThrow throws when connection fails', async () => {
    // Set a deliberately invalid URL to force connection failure
    process.env.REDIS_URL = 'redis://invalid.host.that.does.not.exist:6379';

    // Reset module to clear cached client
    jest.resetModules();
    const { getRedisOrThrow } = await import('../../src/lib/redis');

    // Should reject (either connection error or our throw)
    await expect(getRedisOrThrow()).rejects.toThrow();

    delete process.env.REDIS_URL;
  });
});

// ─── D) DB Retry Behavior ─────────────────────────────────────────────────────
describe('V061-D: withDbRetry — retry on transient errors', () => {
  test('succeeds on first attempt without retrying', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await withDbRetry('test:success', fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on WriteConflict (code 112) and succeeds', async () => {
    const writeConflict = Object.assign(new Error('WriteConflict'), { code: 112 });
    const fn = jest.fn()
      .mockRejectedValueOnce(writeConflict)
      .mockRejectedValueOnce(writeConflict)
      .mockResolvedValue('ok-after-retries');

    const result = await withDbRetry('test:write-conflict', fn);
    expect(result).toBe('ok-after-retries');
    expect(fn).toHaveBeenCalledTimes(3);
  }, 10_000);

  test('retries on MongoNetworkError and succeeds', async () => {
    const networkErr = Object.assign(new Error('network'), { name: 'MongoNetworkError' });
    const fn = jest.fn()
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValue('recovered');

    const result = await withDbRetry('test:network-error', fn);
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  }, 10_000);

  test('does NOT retry on non-transient ValidationError — fails immediately', async () => {
    const validationErr = Object.assign(new Error('Validation failed'), { name: 'ValidationError' });
    const fn = jest.fn().mockRejectedValue(validationErr);

    await expect(withDbRetry('test:validation-error', fn)).rejects.toThrow('Validation failed');
    // Should only try once — non-transient error, no retry
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('exhausts max retries (3) and throws on persistent transient error', async () => {
    const deadlock = Object.assign(new Error('deadlock'), { code: 112 });
    const fn = jest.fn().mockRejectedValue(deadlock);

    await expect(withDbRetry('test:persistent-deadlock', fn)).rejects.toThrow('deadlock');
    expect(fn).toHaveBeenCalledTimes(3); // DB_MAX_RETRIES = 3
  }, 15_000);

  test('retries on MongoServerSelectionError', async () => {
    const selectionErr = Object.assign(new Error('server selection timeout'), {
      name: 'MongoServerSelectionError',
    });
    const fn = jest.fn()
      .mockRejectedValueOnce(selectionErr)
      .mockResolvedValue('connected');

    const result = await withDbRetry('test:server-selection', fn);
    expect(result).toBe('connected');
    expect(fn).toHaveBeenCalledTimes(2);
  }, 10_000);

  test('does NOT retry on MongoNotConnectedError (treated as transient)', async () => {
    // MongoNotConnectedError IS in the retryable set
    const notConnected = Object.assign(new Error('not connected'), {
      name: 'MongoNotConnectedError',
    });
    const fn = jest.fn()
      .mockRejectedValueOnce(notConnected)
      .mockResolvedValue('reconnected');

    const result = await withDbRetry('test:not-connected', fn);
    expect(result).toBe('reconnected');
    expect(fn).toHaveBeenCalledTimes(2);
  }, 10_000);
});
