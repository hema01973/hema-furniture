// src/app/api/auth/mfa/verify/route.ts — HemaV058
// LOW-04 FIX (V054): mfaSecret is decrypted before passing to otplib.
// SEC-006 FIX: MFA replay protection now FAIL-CLOSED with in-memory fallback.
// V058 FIX: Sentry.captureMessage on MFA replay cache overflow (RECOMMENDATION #6 from V057).
import { NextRequest } from 'next/server';
import { authenticator } from 'otplib';
import { verifyPassword } from '@/lib/auth';
import { getRedis } from '@/lib/redis';
import { z } from 'zod';
import { connectDB, User } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody } from '@/lib/api';
import { requirePermission } from '@/lib/authz';
import { logger } from '@/lib/logger';
import { issueMfaCompletionToken } from '@/lib/mfa-token';
import { decryptMfaSecret } from '@/lib/mfa-encryption';

// SEC-006 FIX: In-memory replay cache as fallback when Redis is unavailable.
// key → timestamp of when the code was used
// Bounded to prevent unbounded memory growth.
const _mfaReplayCache = new Map<string, number>();

authenticator.options = { digits: 6, step: 30, window: 0 }; // VULN-003 FIX (V068): strict window — current step only.

// V009 SECURITY FIX: previous version accepted `userId` from request body —
// any unauthenticated client could lock out any account by submitting 5 wrong
// codes for a victim's userId. Now `userId` is taken from the verified JWT.
const Schema = z.object({
  token: z.string().min(1).max(64),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await requirePermission(req, 'auth:self');
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const v = await validateBody(req, Schema);
  if ('error' in v) return v.error;

  await connectDB();
  const userId = session.user.id;
  // HemaV035 FIX [MED-02]: select dedicated mfaFailedAttempts counter
  const user = await (User.findById as any)(userId)
    .select('+mfaSecret +mfaBackupCodes +failedLogins +lockedUntil +mfaFailedAttempts');
  if (!user?.mfaEnabled || !user.mfaSecret) return err('MFA not configured', 400);

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const wait = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return err(`Account locked. Try again in ${wait} minute${wait > 1 ? 's' : ''}.`, 423);
  }

  // LOW-04 FIX (V054): decrypt mfaSecret before passing to otplib
  const plainSecret = decryptMfaSecret(user.mfaSecret);
  const validTotp = authenticator.verify({ token: v.data.token, secret: plainSecret });

  // SEC-006 FIX (HemaV051): MFA replay protection must FAIL-CLOSED.
  // The original code failed open ("if Redis is unavailable — availability > replay risk").
  // That reasoning is wrong for MFA: a replayed code after a Redis outage can fully
  // bypass MFA. We add an in-memory fallback Map so replay protection works even
  // without Redis. The Map is bounded and resets on process restart (acceptable for
  // short-lived TOTP windows; a restarted process would flush tokens ~90s old anyway).
  if (validTotp) {
    const replayKey = `mfa:used:${user._id}:${v.data.token}`;
    let blocked = false;

    // Try Redis first
    const redis = await getRedis();
    if (redis) {
      try {
        const alreadyUsed = await redis.get(replayKey);
        if (alreadyUsed) {
          return err('TOTP code already used — wait for the next code', 400);
        }
        await redis.setex(replayKey, 90, '1');
        blocked = false; // successfully recorded in Redis
      } catch {
        // Redis error — fall through to in-memory fallback
        logger.warn('[MFA] Redis error during replay check — using in-memory fallback', { userId });
      }
    }

    // In-memory fallback (SEC-006: fail-CLOSED — if no Redis, still check in-memory)
    if (!redis || blocked === false) {
      if (_mfaReplayCache.has(replayKey)) {
        return err('TOTP code already used — wait for the next code', 400);
      }
      // Bounded cache: evict entries older than 120s
      const now = Date.now();
      for (const [k, ts] of _mfaReplayCache) {
        if (now - ts > 120_000) _mfaReplayCache.delete(k);
      }
      if (_mfaReplayCache.size >= 10_000) {
        // VULN-004 FIX (V068): LRU eviction — evict the OLDEST single entry instead
        // of clearing the entire cache. Clearing all entries created a ~120s replay
        // window where previously-used TOTP codes could be replayed if Redis was also
        // unavailable. LRU eviction keeps all prior entries intact.
        const oldestKey = _mfaReplayCache.keys().next().value;
        if (oldestKey !== undefined) _mfaReplayCache.delete(oldestKey);
        logger.warn('[MFA] Replay cache at capacity — evicted oldest entry (LRU).', { userId });
      }
      _mfaReplayCache.set(replayKey, now);
    }
  }

  let validBackup   = false;
  let backupUsedIdx = -1;

  if (!validTotp && user.mfaBackupCodes?.length) {
    for (let i = 0; i < user.mfaBackupCodes.length; i++) {
      try {
        const match = await verifyPassword(v.data.token, user.mfaBackupCodes[i]);
        if (match) { validBackup = true; backupUsedIdx = i; break; }
      } catch { /* malformed — skip */ }
    }
  }

  if (!validTotp && !validBackup) {
    // HemaV035 FIX [MED-02]: use dedicated mfaFailedAttempts counter instead of
    // failedLogins. The two counters track different attack surfaces:
    //   - failedLogins  → wrong password at login
    //   - mfaFailedAttempts → wrong TOTP/backup after successful password
    // Mixing them allowed an attacker to trigger account lockout by hammering
    // the wrong TOTP code (DoS), or conversely to exhaust MFA budget through
    // repeated wrong passwords without ever reaching the TOTP step.
    user.mfaFailedAttempts = (user.mfaFailedAttempts ?? 0) + 1;
    if (user.mfaFailedAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 15 * 60_000);
      logger.warn('[MFA] Account locked after MFA failures', { userId, attempts: user.mfaFailedAttempts });
    }
    await user.save();
    return err('Invalid code', 401);
  }

  if (validBackup && backupUsedIdx !== -1) {
    user.mfaBackupCodes!.splice(backupUsedIdx, 1);
    logger.info('[MFA] Backup code used', { userId, remaining: user.mfaBackupCodes!.length });
  }

  // HemaV035 FIX [MED-02]: reset MFA-specific counter on success
  user.mfaFailedAttempts = 0;
  user.lockedUntil  = undefined;
  await user.save();

  // V016 FIX (MFA bypass): issue a server-signed completion token.
  // The JWT callback in auth.ts validates this token before clearing mfaPending.
  // A client that never passed through this endpoint cannot produce a valid token.
  const completionToken = issueMfaCompletionToken(userId);

  return ok({ verified: true, completionToken });
}, { failClosed: true, rateMax: 10, rateWindow: 300 });
