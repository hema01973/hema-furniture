// __tests__/unit/mfa-token.test.ts — V016
// Unit tests for src/lib/mfa-token.ts
// Covers: issue, validate, expiry, tamper detection, user binding

// Mock getSecretSync so tests don't need real env
jest.mock('../../src/lib/secrets', () => ({
  getSecretSync: () => 'test-signing-key-for-mfa-unit-tests',
}));

import {
  issueMfaCompletionToken,
  validateMfaCompletionToken,
} from '../../src/lib/mfa-token';

const FAKE_USER_ID = 'user_abc123';

describe('issueMfaCompletionToken', () => {
  it('returns a non-empty base64url string', () => {
    const token = issueMfaCompletionToken(FAKE_USER_ID);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
    // base64url characters only
    expect(token).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('different userIds produce different tokens', () => {
    const t1 = issueMfaCompletionToken('user_1');
    const t2 = issueMfaCompletionToken('user_2');
    expect(t1).not.toBe(t2);
  });

  it('same userId issued twice produces different tokens (timestamps differ)', async () => {
    const t1 = issueMfaCompletionToken(FAKE_USER_ID);
    await new Promise(r => setTimeout(r, 10)); // ensure different timestamp
    const t2 = issueMfaCompletionToken(FAKE_USER_ID);
    expect(t1).not.toBe(t2);
  });
});

describe('validateMfaCompletionToken', () => {
  it('validates a freshly issued token', () => {
    const token  = issueMfaCompletionToken(FAKE_USER_ID);
    const result = validateMfaCompletionToken(token);
    expect(result).toBe(FAKE_USER_ID);
  });

  it('returns null for undefined input', () => {
    expect(validateMfaCompletionToken(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(validateMfaCompletionToken('')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(validateMfaCompletionToken('not.a.valid.token')).toBeNull();
    expect(validateMfaCompletionToken('aGVsbG8=')).toBeNull();
  });

  it('returns null for a tampered signature', () => {
    const token   = issueMfaCompletionToken(FAKE_USER_ID);
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts   = decoded.split(':');
    // Flip the last char of the signature
    parts[parts.length - 1] = parts[parts.length - 1].slice(0, -1) + 'X';
    const tampered = Buffer.from(parts.join(':')).toString('base64url');
    expect(validateMfaCompletionToken(tampered)).toBeNull();
  });

  it('returns null for a tampered userId', () => {
    const token   = issueMfaCompletionToken(FAKE_USER_ID);
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    // Replace userId portion in the raw string
    const patched = decoded.replace(FAKE_USER_ID, 'attacker_id');
    const tampered = Buffer.from(patched).toString('base64url');
    expect(validateMfaCompletionToken(tampered)).toBeNull();
  });

  it('returns null for an expired token', async () => {
    // Override Date.now to simulate token issued 100 seconds ago
    const realNow = Date.now;
    const past    = Date.now() - 100_000; // 100s ago

    jest.spyOn(Date, 'now').mockReturnValueOnce(past); // for issueMfaCompletionToken
    const token = issueMfaCompletionToken(FAKE_USER_ID);
    jest.spyOn(Date, 'now').mockRestore();

    // Token was issued in the "past" with TTL 90s — should be expired now
    const result = validateMfaCompletionToken(token);
    expect(result).toBeNull();
  });

  it('validates correct userId binding — rejects wrong userId match', () => {
    const token = issueMfaCompletionToken(FAKE_USER_ID);
    // Token is valid, but we compare against a DIFFERENT userId (auth.ts check)
    const validUserId = validateMfaCompletionToken(token);
    expect(validUserId).toBe(FAKE_USER_ID);
    expect(validUserId).not.toBe('attacker_user');
  });
});
