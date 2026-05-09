// src/app/api/secrets/rotate/route.ts — HemaV068
// HIGH-002 FIX (V068): Replaced local getIp() (which read the leftmost X-Forwarded-For —
//   client-controlled and trivially spoofed) with canonical getClientIp() from @/lib/ip
//   that uses the rightmost entry / CF-Connecting-IP. Forensic audit logs now contain
//   the real IP instead of an attacker-supplied value.
// V059 ENHANCEMENTS:
//   - Added rollback action support (POST with action='rollback')
//   - Added audit log endpoint (GET) for diagnostics
//   - Dual-key rotation is transparent (handled in secrets.ts)
//
// AWS Secrets Manager calls this endpoint after rotating a secret.
// The Lambda rotation function POSTs the new value so the in-memory cache
// is updated without requiring a server restart.
//
// Security:
//   - Protected by ROTATION_WEBHOOK_SECRET (timing-safe comparison).
//   - Only accepts known SecretName values — rejects unknown keys.
//   - Rate-limited: 10 requests per 60 seconds per IP (V058 fix).
//   - Audit-logged on every call.
//
// AWS Lambda rotation template:
//   fetch('https://hemafurniture.com/api/secrets/rotate', {
//     method: 'POST',
//     headers: {
//       'Content-Type':  'application/json',
//       'X-Rotation-Key': process.env.ROTATION_WEBHOOK_SECRET,
//     },
//     body: JSON.stringify({ name: 'NEXTAUTH_SECRET', value: newSecretValue }),
//   });
//
// Rollback template (V059):
//   fetch('https://hemafurniture.com/api/secrets/rotate', {
//     method: 'POST',
//     headers: {
//       'Content-Type':  'application/json',
//       'X-Rotation-Key': process.env.ROTATION_WEBHOOK_SECRET,
//     },
//     body: JSON.stringify({ name: 'NEXTAUTH_SECRET', action: 'rollback' }),
//   });

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { rotateSecret, rollbackSecret, getRotationAuditLog, type SecretName } from '@/lib/secrets';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/redis';
import { withErrorHandler, err, ok } from '@/lib/api';
import { getClientIp } from '@/lib/ip';

const VALID_SECRET_NAMES: ReadonlySet<string> = new Set([
  'NEXTAUTH_SECRET',
  'CSRF_SECRET',        // LOW-03 FIX (V067): Added — used by csrf.ts for independent rotation (MED-06)
  'MONGODB_URI', 'REDIS_URL',
  'PAYMOB_API_KEY', 'PAYMOB_HMAC_SECRET', 'PAYMOB_INTEGRATION_ID', 'PAYMOB_IFRAME_ID',
  'SMTP_USER', 'SMTP_PASS',
  'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_CLOUD_NAME',
  'SENTRY_AUTH_TOKEN', 'SLACK_WEBHOOK_URL', 'CRON_SECRET', 'METRICS_SECRET',
  'MFA_ENCRYPTION_KEY',
  'CSP_REPORT_URI',
  'CLAIM_TOKEN_SECRET', // LOW-03 FIX (V067): Added — used for guest order claim tokens
]);

const RotateSchema = z.object({
  name:      z.string().min(1).max(100),
  value:     z.string().min(1).max(10_000).optional(),
  action:    z.enum(['rotate', 'rollback']).default('rotate'),
  initiator: z.string().min(1).max(100).default('aws-sm-lambda'),
});

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.ROTATION_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = req.headers.get('x-rotation-key') ?? '';
  if (provided.length !== secret.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(provided, 'utf8'),
    Buffer.from(secret,   'utf8'),
  );
}

// HIGH-002 FIX (V068): getIp() removed — use getClientIp() from @/lib/ip instead.

// ── GET: Read rotation audit log (diagnostics) ────────────────────────────────
// MED-03 FIX (V065): Now queries MongoDB (persistent, survives restarts) instead of
// returning the in-memory cache (which is empty after every process restart).
// In-memory cache is still used as a fast-path warm fallback.
export async function GET(req: NextRequest) {
  const ip = getClientIp(req); // HIGH-002 FIX (V068): use canonical rightmost-XFF logic
  const rl = await rateLimit(`secrets-rotate-get:${ip}`, 10, 60, true);
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  if (!isAuthorized(req)) {
    logger.warn('[SecretsRotate] Unauthorized audit log read attempt', { ip });
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // MED-03 FIX (V065): Query MongoDB for the persistent audit log.
  // The in-memory cache is empty after a process restart, so operators diagnosing
  // post-deployment issues would see an empty log — misleading and operationally dangerous.
  // MongoDB is the source of truth (V060 FIX-A made it append-only).
  // Limit to 200 most recent entries to keep response size bounded.
  try {
    const { connectDB, SecretRotationAuditLog } = await import('@/lib/mongodb');
    await connectDB();
    const dbEntries = await (SecretRotationAuditLog.find as any)({})
      .sort({ rotatedAt: -1 })
      .limit(200)
      .lean();
    return NextResponse.json({ success: true, entries: dbEntries, count: dbEntries.length, source: 'mongodb' });
  } catch (e) {
    // DB unavailable — fall back to in-memory cache with clear indication
    logger.warn('[SecretsRotate] MongoDB unavailable for audit log — returning in-memory cache', { error: String(e) });
    const memLog = getRotationAuditLog();
    return NextResponse.json({
      success: true,
      entries: memLog,
      count: memLog.length,
      source: 'memory-cache',
      warning: 'MongoDB unavailable — log may be incomplete after process restarts',
    });
  }
}

// ── POST: Rotate or rollback a secret ────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ip = getClientIp(req); // HIGH-002 FIX (V068): use canonical rightmost-XFF logic
  // Rate limit: 10 per 60s per IP. failClosed=true for privileged endpoint.
  const rl = await rateLimit(`secrets-rotate:${ip}`, 10, 60, true);
  if (rl.blocked) {
    logger.warn('[SecretsRotate] Rate limited', { ip });
    return NextResponse.json(
      { success: false, error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After':           String(rl.retryAfterSec),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  if (!isAuthorized(req)) {
    logger.warn('[SecretsRotate] Unauthorized rotation attempt', { ip });
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = RotateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 400 });
  }

  const { name, value, action, initiator } = parsed.data;

  if (!VALID_SECRET_NAMES.has(name)) {
    logger.warn('[SecretsRotate] Unknown secret name rejected', { name });
    return NextResponse.json({ success: false, error: 'Unknown secret name' }, { status: 400 });
  }

  // ── Rollback action (V059) ────────────────────────────────────────────────
  if (action === 'rollback') {
    try {
      rollbackSecret(name as SecretName, initiator);
      logger.info('[SecretsRotate] Secret rolled back', { name, initiator });
      return NextResponse.json({ success: true, action: 'rollback', name });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error('[SecretsRotate] Rollback failed', { name, initiator, error });
      return NextResponse.json({ success: false, error }, { status: 409 });
    }
  }

  // ── Rotate action ─────────────────────────────────────────────────────────
  if (!value) {
    return NextResponse.json({ success: false, error: 'value is required for rotate action' }, { status: 400 });
  }

  rotateSecret(name as SecretName, value, initiator);
  logger.info('[SecretsRotate] Secret rotated successfully', { name, initiator });

  // LOW-02 FIX (V067): Reset SMTP transporter after credential rotation so next
  // send uses the new credentials instead of the stale cached transporter.
  if (name === 'SMTP_USER' || name === 'SMTP_PASS') {
    try {
      const { resetTransporter } = await import('@/lib/email');
      resetTransporter();
      logger.info('[SecretsRotate] SMTP transporter reset after credential rotation');
    } catch (e) {
      logger.warn('[SecretsRotate] Failed to reset SMTP transporter', { error: String(e) });
    }
  }

  return NextResponse.json({ success: true, action: 'rotate', rotated: name });
}
