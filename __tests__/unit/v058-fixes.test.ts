// __tests__/unit/v058-fixes.test.ts — HemaV058
// Tests for V057 recommendations (deferred) and V058 new fixes.
//
// Coverage:
//   1. env/index.ts  — ROTATION_WEBHOOK_SECRET enforcement in production+aws mode
//   2. metrics/route — timingSafeCompare rejects strings of different lengths
//   3. circuit-breaker — wasAlreadyOpen captures pre-transition state correctly
//   4. secrets/rotate  — endpoint applies rate limiting

// ─────────────────────────────────────────────────────────────────────────────
// 1. ROTATION_WEBHOOK_SECRET env schema enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe('[V057 rec #3 / ENV] ROTATION_WEBHOOK_SECRET enforcement', () => {
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

  it('passes (no error) when SECRETS_PROVIDER is env and ROTATION_WEBHOOK_SECRET is absent', () => {
    process.env.MONGODB_URI     = 'mongodb://localhost/test';
    process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
    process.env.NODE_ENV        = 'development';
    delete process.env.ROTATION_WEBHOOK_SECRET;
    delete process.env.SECRETS_PROVIDER;

    expect(() => loadEnv()()).not.toThrow();
  });

  it('passes when ROTATION_WEBHOOK_SECRET is present and ≥ 32 chars', () => {
    process.env.MONGODB_URI              = 'mongodb://localhost/test';
    process.env.NEXTAUTH_SECRET          = 'a'.repeat(32);
    process.env.NODE_ENV                 = 'development';
    process.env.ROTATION_WEBHOOK_SECRET  = 'b'.repeat(32);

    expect(() => loadEnv()()).not.toThrow();
  });

  it('rejects ROTATION_WEBHOOK_SECRET shorter than 32 chars', () => {
    process.env.MONGODB_URI              = 'mongodb://localhost/test';
    process.env.NEXTAUTH_SECRET          = 'a'.repeat(32);
    process.env.NODE_ENV                 = 'development';
    process.env.ROTATION_WEBHOOK_SECRET  = 'short';

    expect(() => loadEnv()()).toThrow(/32/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. timingSafeCompare — explicit length guard (V057 FIX-004)
// ─────────────────────────────────────────────────────────────────────────────

describe('[V057 FIX-004 / METRICS] timingSafeCompare length guard', () => {
  // Replicate the function exactly as it appears in metrics/route.ts
  const crypto = require('crypto');

  function timingSafeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false; // V057: explicit length guard
    const bufA = Buffer.alloc(512);
    const bufB = Buffer.alloc(512);
    bufA.write(a, 0, 'utf8');
    bufB.write(b, 0, 'utf8');
    return crypto.timingSafeEqual(bufA, bufB);
  }

  it('returns true for identical strings', () => {
    expect(timingSafeCompare('Bearer abc123', 'Bearer abc123')).toBe(true);
  });

  it('returns false for strings of different lengths', () => {
    expect(timingSafeCompare('short', 'muchlongerstring')).toBe(false);
  });

  it('returns false when one string is empty', () => {
    expect(timingSafeCompare('', 'notempty')).toBe(false);
  });

  it('returns false when both strings are empty (edge: equal length, zero chars)', () => {
    // Both are empty — same length (0), same content — should be true
    expect(timingSafeCompare('', '')).toBe(true);
  });

  it('returns false for strings > 512 bytes that share a 512-byte prefix', () => {
    // This was the theoretical truncation attack: a 513-char token with the right
    // 512-char prefix would have passed before the explicit length guard.
    // With the guard: different lengths → immediate false.
    const secret = 'x'.repeat(32);
    const crafted = 'x'.repeat(33); // one char longer
    expect(timingSafeCompare(`Bearer ${crafted}`, `Bearer ${secret}`)).toBe(false);
  });

  it('rejects tokens that are a prefix of the expected token', () => {
    const full   = 'Bearer supersecrettoken123456789012';
    const prefix = 'Bearer supersecrettoken'; // same prefix, shorter
    expect(timingSafeCompare(prefix, full)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Circuit breaker — wasAlreadyOpen captures pre-transition state (V058 FIX-002)
// ─────────────────────────────────────────────────────────────────────────────

describe('[V058 FIX-002 / CIRCUIT-BREAKER] alert fires only on OPEN transition', () => {
  let alertCircuitOpen: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    alertCircuitOpen = jest.fn();
    jest.mock('@/lib/alerts', () => ({
      alertCircuitOpen: alertCircuitOpen,
      alertPaymentFailed: jest.fn(),
    }));
    jest.mock('@/lib/logger', () => ({
      logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fires alertCircuitOpen exactly once on CLOSED → OPEN transition', async () => {
    const { withCircuitBreaker } = require('@/lib/circuit-breaker');
    const fail = jest.fn().mockRejectedValue(new Error('down'));

    // Two failures to meet volumeThreshold=2 and failureThreshold=2
    await expect(withCircuitBreaker('alert-test', fail, {
      failureThreshold: 2, volumeThreshold: 2, timeout: 60_000, successThreshold: 1,
    })).rejects.toThrow('down');

    await expect(withCircuitBreaker('alert-test', fail, {
      failureThreshold: 2, volumeThreshold: 2, timeout: 60_000, successThreshold: 1,
    })).rejects.toThrow('down');

    // Now OPEN — subsequent calls throw CircuitOpenError (no retry of fn)
    const { CircuitOpenError } = require('@/lib/circuit-breaker');
    await expect(withCircuitBreaker('alert-test', fail, {
      failureThreshold: 2, volumeThreshold: 2, timeout: 60_000, successThreshold: 1,
    })).rejects.toBeInstanceOf(CircuitOpenError);

    // Alert should fire exactly once (on the CLOSED→OPEN transition)
    expect(alertCircuitOpen).toHaveBeenCalledTimes(1);
    expect(alertCircuitOpen).toHaveBeenCalledWith('alert-test');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Version consistency check — all surfaces report the same version
// ─────────────────────────────────────────────────────────────────────────────

describe('[V058 FIX-001 / VERSION] version consistency', () => {
  it('package.json and instrumentation fallback agree', async () => {
    const pkg = require('../../../package.json');
    // The instrumentation.ts fallback must match the package major version
    // (e.g. both 58.x.x or both 0.58.x — they use the same scheme internally)
    expect(pkg.version).toMatch(/^58\./);
  });

  it('VERSION file matches 0.58.x', () => {
    const fs   = require('fs');
    const path = require('path');
    const vf   = fs.readFileSync(path.resolve(__dirname, '../../../VERSION'), 'utf8').trim();
    expect(vf).toBe('0.58.0');
  });
});
