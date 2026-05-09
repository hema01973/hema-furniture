// __tests__/unit/security/mfa-token.test.ts — V037: VULN-11 cross-user protection tests
// Tests the HMAC-signed MFA completion token to ensure it cannot be reused
// across different users (token substitution attack).

import { issueMfaCompletionToken, validateMfaCompletionToken } from '@/lib/mfa-token';

// ── Basic happy-path ──────────────────────────────────────────────
describe('issueMfaCompletionToken / validateMfaCompletionToken — basic', () => {
  it('issues a token that validates back to the same userId', () => {
    const token = issueMfaCompletionToken('user-abc123');
    expect(validateMfaCompletionToken(token)).toBe('user-abc123');
  });

  it('returns null for undefined input', () => {
    expect(validateMfaCompletionToken(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(validateMfaCompletionToken('')).toBeNull();
  });

  it('returns null for a garbage string', () => {
    expect(validateMfaCompletionToken('not-a-valid-token')).toBeNull();
  });

  it('returns null for a base64url string with wrong structure', () => {
    const garbage = Buffer.from('onlyTwoParts:12345').toString('base64url');
    expect(validateMfaCompletionToken(garbage)).toBeNull();
  });
});

// ── Cross-user protection (VULN-11) ──────────────────────────────
describe('validateMfaCompletionToken — cross-user protection', () => {
  it('validates to user-A when token was issued for user-A', () => {
    const tokenForA = issueMfaCompletionToken('user-A');
    // The caller (auth.ts) must compare this result against the session userId.
    // If they differ, access is denied — this test verifies the token encodes the right id.
    expect(validateMfaCompletionToken(tokenForA)).toBe('user-A');
  });

  it('does NOT return user-B when token was issued for user-A', () => {
    // Simulates an attacker trying to use user-A token to complete MFA for user-B.
    // The auth.ts check: `validatedId !== session.user.id → reject`
    const tokenForA = issueMfaCompletionToken('user-A');
    const result    = validateMfaCompletionToken(tokenForA);
    expect(result).not.toBe('user-B');
    expect(result).toBe('user-A'); // returns A's id — mismatch is caught upstream
  });

  it('rejects a token with a tampered userId (HMAC fails)', () => {
    // Attacker decodes the token, replaces userId, re-encodes without valid HMAC.
    const realToken = issueMfaCompletionToken('user-A');
    const decoded   = Buffer.from(realToken, 'base64url').toString('utf8');
    // Replace user-A with user-B in the raw payload
    const tampered  = Buffer.from(decoded.replace('user-A', 'user-B')).toString('base64url');
    // HMAC covers userId:expiresAt — any change invalidates the signature
    expect(validateMfaCompletionToken(tampered)).toBeNull();
  });

  it('rejects a token with a tampered expiresAt (HMAC fails)', () => {
    const realToken = issueMfaCompletionToken('user-A');
    const decoded   = Buffer.from(realToken, 'base64url').toString('utf8');
    const parts     = decoded.split(':');
    // expiresAt is second-to-last — push it far into the future
    parts[parts.length - 2] = String(Date.now() + 999_999_999);
    const tampered = Buffer.from(parts.join(':')).toString('base64url');
    expect(validateMfaCompletionToken(tampered)).toBeNull();
  });

  it('rejects a token with a truncated HMAC signature', () => {
    const realToken = issueMfaCompletionToken('user-A');
    const decoded   = Buffer.from(realToken, 'base64url').toString('utf8');
    const parts     = decoded.split(':');
    // Truncate the last segment (signature) by one character
    parts[parts.length - 1] = parts[parts.length - 1].slice(0, -1);
    const tampered = Buffer.from(parts.join(':')).toString('base64url');
    expect(validateMfaCompletionToken(tampered)).toBeNull();
  });
});

// ── Expiry ────────────────────────────────────────────────────────
describe('validateMfaCompletionToken — expiry', () => {
  it('rejects an already-expired token', () => {
    // We cannot easily fast-forward time without mocking, so we forge an
    // expired token manually using the internal format knowledge.
    // This is intentionally a white-box test.
    const crypto = require('crypto');
    const { getSecretSync } = require('@/lib/secrets');
    const signingKey = `mfa-completion:${getSecretSync('NEXTAUTH_SECRET')}`;

    const userId    = 'user-expired';
    const expiresAt = Date.now() - 1000; // already in the past
    const payload   = `${userId}:${expiresAt}`;
    const sig       = crypto.createHmac('sha256', signingKey).update(payload).digest('base64url');
    const token     = Buffer.from(`${payload}:${sig}`).toString('base64url');

    expect(validateMfaCompletionToken(token)).toBeNull();
  });
});
