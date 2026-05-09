// src/... — HemaV050: FIX #4 — explicit buffer-length check before timingSafeEqual
// ──────────────────────────────────────────────────────────────────
// Fixes the acknowledged MFA bypass (V015 SECURITY NOTE in auth.ts):
//
//   BEFORE: client calls useSession().update({ mfaVerified: true }) after
//   hitting /api/auth/mfa/verify. The JWT callback trusted this client-driven
//   trigger without re-validating the TOTP server-side. A local attacker could
//   craft the update payload and bypass MFA entirely.
//
//   AFTER:  /api/auth/mfa/verify now issues a short-lived (90-second) signed
//   HMAC-SHA256 token tied to the userId. The JWT callback (auth.ts) validates
//   this token before clearing mfaPending — client-driven updates without a
//   valid server token are ignored.
//
// Token format: base64url( userId:expiresAt:HMAC-SHA256(userId:expiresAt) )
// — intentionally simple; no external dependency, no JWT library needed.

import crypto from 'crypto';
import { getSecretSync } from './secrets';

const TTL_MS = 90_000; // 90 seconds — enough for one page transition

function signingKey(): string {
  // Reuse NEXTAUTH_SECRET so no new env var is needed; scoped with prefix
  return `mfa-completion:${getSecretSync('NEXTAUTH_SECRET')}`;
}

function hmac(data: string): string {
  return crypto.createHmac('sha256', signingKey()).update(data).digest('base64url');
}

/** Issue a server-signed MFA completion token for the given userId. */
export function issueMfaCompletionToken(userId: string): string {
  const expiresAt = Date.now() + TTL_MS;
  const payload   = `${userId}:${expiresAt}`;
  const sig       = hmac(payload);
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

/**
 * Validate a server-signed MFA completion token.
 * Returns the userId if valid, null otherwise.
 */
export function validateMfaCompletionToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts   = decoded.split(':');
    // format: userId : expiresAt : sig  (userId itself may contain ':' if ever changed)
    // sig is always the last segment, expiresAt second-to-last, rest is userId
    if (parts.length < 3) return null;
    const sig       = parts[parts.length - 1] as string;  // length >= 3 guaranteed above
    const expiresAt = parseInt(parts[parts.length - 2] as string, 10);
    const userId    = parts.slice(0, parts.length - 2).join(':');

    if (!userId || isNaN(expiresAt)) return null;
    if (Date.now() > expiresAt) return null; // expired

    const payload   = `${userId}:${expiresAt}`;
    const expected  = hmac(payload);

    // FIX #4 (V031): crypto.timingSafeEqual THROWS if buffers differ in length.
    // In V030, the catch block suppressed the RangeError silently (returning null),
    // but this is fragile and confusing. Explicitly pad both to equal length so
    // the comparison is always safe regardless of HMAC output length variation.
    const bufSig      = Buffer.from(sig);
    const bufExpected = Buffer.from(expected);
    if (bufSig.length !== bufExpected.length) return null; // length mismatch = invalid
    if (!crypto.timingSafeEqual(bufSig, bufExpected)) return null;

    return userId;
  } catch {
    return null;
  }
}
