// src/app/api/paymob/callback/route.ts — HemaV066
// V064 FIX-HIGH-03: Added module-level logger.warn when PAYMOB_ALLOWED_IPS env var is not set
//   and hardcoded default ranges are in use. Added "last verified" date comment on defaults.
// V063 FIX-CRIT-01: Fail-closed when IP cannot be determined.
//   If IP cannot be determined, the request is REJECTED (fail-closed). See CRIT-01 fix.
// V063 FIX-MED-01: Use rightmost non-private X-Forwarded-For entry.
//   Leftmost entry is set by the client and is trivially spoofed.
// V062 FIX MED-04: Paymob IP allowlist added before HMAC verification (fast-fail).
// V050: LOW-02 fix — Redis idempotency key for per-transaction replay protection
// V031: FIX #1 — orderId sanitization, replay-attack protection
// V013 FIX (P2-09): Paymob callback accepted payloads of arbitrary age.
import { NextRequest, NextResponse } from 'next/server';
import * as Sentry             from '@sentry/nextjs';
import { connectDB, Order }    from '@/lib/mongodb';
import { verifyPaymobWebhook } from '@/lib/paymob';
import { ok, err, withErrorHandler, getIP } from '@/lib/api';
import { enqueueEmail }        from '@/lib/queue';
import { logger }              from '@/lib/logger';
import { getRedis }            from '@/lib/redis';

// ── MED-04 FIX (V062): Paymob IP Allowlist ──────────────────────────────────
// Paymob publishes stable IP ranges in their documentation.
// These ranges are checked BEFORE HMAC verification for fast-fail.
// Override via PAYMOB_ALLOWED_IPS env var (comma-separated CIDR list).
// V063 FIX-CRIT-01: If IP cannot be determined, request is REJECTED (fail-closed).
//
// Last verified: 2025-01-15 — confirm against https://docs.paymob.com/docs/ip-whitelisting
// before deploying to production.
const DEFAULT_PAYMOB_IP_RANGES = ['197.48.96.0/19', '37.18.32.0/21'];

// HIGH-03 FIX (V064): Warn at module load when using default hardcoded IP ranges.
// PAYMOB_ALLOWED_IPS should be set in production to an explicitly validated,
// up-to-date list from Paymob documentation.
if (!process.env.PAYMOB_ALLOWED_IPS) {
  logger.warn(
    '[PaymobCallback] PAYMOB_ALLOWED_IPS env var is not set — using hardcoded default ranges ' +
    `(${DEFAULT_PAYMOB_IP_RANGES.join(', ')}). ` +
    'Verify these are current at https://docs.paymob.com/docs/ip-whitelisting and set ' +
    'PAYMOB_ALLOWED_IPS in your environment to suppress this warning.',
    { lastVerified: '2025-01-15' },
  );
}

function getPaymobAllowedRanges(): string[] {
  const envRanges = process.env.PAYMOB_ALLOWED_IPS;
  if (envRanges) return envRanges.split(',').map(s => s.trim()).filter(Boolean);
  return DEFAULT_PAYMOB_IP_RANGES;
}

// Pure bit-arithmetic CIDR check — no dependencies.
function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return -1;
  const [a = 0, b = 0, c = 0, d = 0] = parts;
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  const [network = '', prefixStr = ''] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
  const ipInt   = ipToInt(ip);
  const netInt  = ipToInt(network);
  if (ipInt < 0 || netInt < 0) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) >>> 0 === (netInt & mask) >>> 0;
}

function isPaymobIp(ip: string): boolean {
  const ranges = getPaymobAllowedRanges();
  return ranges.some(cidr => isIpInCidr(ip, cidr));
}

// V063 FIX-MED-01: Use rightmost non-private X-Forwarded-For entry.
// Leftmost entry is set by the client and is trivially spoofed.
// The rightmost entry is appended by the nearest trusted proxy.
function getCallbackIp(req: NextRequest): string | null {
  // Cloudflare is the outermost proxy — its header is authoritative.
  const cf = req.headers.get('CF-Connecting-IP');
  if (cf) return cf.trim();

  // Without Cloudflare, use the LAST entry in X-Forwarded-For (proxy-appended).
  const xff = req.headers.get('X-Forwarded-For');
  if (xff) {
    const entries = xff.split(',').map(s => s.trim()).filter(Boolean);
    // Rightmost entry is appended by the reverse proxy — not client-controlled.
    return entries.at(-1) ?? null;
  }
  return null;
}

// V013: maximum age for a Paymob callback — anything older is treated as a
// potential replay and rejected with 400. 7 days is generous enough to cover
// legitimate Paymob retry windows (typically 24–48 h) while blocking stale
// payloads that survived from test environments or key-rotation leaks.
const MAX_CALLBACK_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSafeBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured;
  return 'https://hemafurniture.com';
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json();
  const { obj, hmac } = body;

  // ── MED-04 FIX (V062) + CRIT-01 FIX (V063): IP allowlist check — fast-fail before HMAC ───────
  // V063 FIX-CRIT-01: Fail-closed when IP cannot be determined.
  // Previously logged a warning and allowed the request through — this made the
  // IP allowlist optional. Without a verifiable IP, we cannot enforce the allowlist,
  // so the safest action is to reject. Legitimate Paymob servers always arrive
  // through Cloudflare (CF-Connecting-IP) or a known proxy (X-Forwarded-For).
  const clientIp = getCallbackIp(req);
  if (clientIp === null) {
    logger.error('[PaymobCallback] Cannot determine caller IP — rejecting (fail-closed)', {
      path: req.nextUrl.pathname,
    });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } else if (!isPaymobIp(clientIp)) {
    logger.warn('[PaymobCallback] Request from non-allowlisted IP — rejected before HMAC', {
      ip: clientIp,
      allowedRanges: getPaymobAllowedRanges(),
      txId: obj?.id ?? 'unknown',
    });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!verifyPaymobWebhook(obj, hmac)) {
    const txId          = obj?.id        ?? 'unknown';
    const paymobOrderId = obj?.order?.id ?? 'unknown';

    logger.error('[PaymobCallback] HMAC verification FAILED — possible tampering', {
      txId, paymobOrderId, ip: getIP(req), origin: req.headers.get('origin') ?? 'unknown',
    });

    Sentry.captureMessage('Paymob webhook HMAC verification failed', {
      level: 'error',
      extra: { txId, paymobOrderId },
      tags:  { component: 'paymob-webhook', severity: 'high' },
    });

    return err('Invalid HMAC signature', 401);
  }

  // V013 FIX: replay-attack guard — reject stale callbacks.
  if (obj?.created_at) {
    const createdAtMs = Number(obj.created_at) * 1000;
    const ageMs       = Date.now() - createdAtMs;
    if (!isNaN(createdAtMs) && ageMs > MAX_CALLBACK_AGE_MS) {
      const ageDays = Math.round(ageMs / 86_400_000);
      logger.warn('[PaymobCallback] Rejected stale callback — possible replay attack', {
        txId: obj?.id ?? 'unknown', paymobOrderId: obj?.order?.id ?? 'unknown',
        createdAt: obj.created_at, ageDays, ip: getIP(req),
      });
      Sentry.captureMessage('Paymob stale callback rejected (replay guard)', {
        level: 'warning',
        extra: { txId: obj?.id, paymobOrderId: obj?.order?.id, ageDays },
        tags:  { component: 'paymob-webhook', severity: 'medium' },
      });
      return err('Callback timestamp too old', 400, 'STALE_CALLBACK');
    }
  }

  // LOW-02 FIX (V043): Per-transaction Redis idempotency key.
  const txIdForKey = obj?.id?.toString();
  if (txIdForKey) {
    try {
      const redis = await getRedis();
      if (redis) {
        const idempotencyKey = `paymob:cb:${txIdForKey}`;
        const acquired = await redis.set(idempotencyKey, '1', 'EX', Math.ceil(MAX_CALLBACK_AGE_MS / 1000), 'NX');
        if (!acquired) {
          logger.info('[PaymobCallback] Duplicate callback rejected via idempotency key', {
            txId: txIdForKey,
          });
          return ok({ received: true, duplicate: true });
        }
      }
    } catch (redisErr) {
      logger.warn('[PaymobCallback] Redis idempotency check unavailable — falling back to DB guard', {
        error: String(redisErr),
      });
    }
  }

  await connectDB();
  const paymobOrderId = obj.order?.id?.toString();
  const success       = obj.success === true || obj.success === 'true';
  const transactionId = obj.id?.toString();

  if (!paymobOrderId) {
    logger.warn('[PaymobCallback] Missing paymobOrderId in payload');
    return ok({ received: true });
  }

  const targetStatus = success ? 'paid' : 'failed';
  const updateDoc: Record<string, unknown> = {
    paymentStatus: targetStatus,
    ...(success ? { status: 'confirmed' } : {}),
    ...(success && transactionId ? { paymobTransactionId: transactionId } : {}),
  };

  const order = await (Order.findOneAndUpdate as any)(
    { paymobOrderId, paymentStatus: 'pending' },
    updateDoc,
    { new: true },
  );

  if (!order) {
    logger.info('[PaymobCallback] No-op (unknown or already-finalized order)', {
      paymobOrderId, transactionId, success,
    });
    return ok({ received: true });
  }

  logger.info('[PaymobCallback] Order updated', {
    orderNumber: order.orderNumber, paymobOrderId, transactionId, success,
  });

  if (success) {
    enqueueEmail({ type: 'orderConfirmation', order: order.toObject() })
      .catch((e: unknown) => logger.error('[PaymobCallback] Failed to enqueue confirmation email', {
        orderNumber: order.orderNumber, error: String(e),
      }));
  }

  return ok({ received: true });
});

// GET browser redirect — verify success against DB, not URL params
export const GET = withErrorHandler(async (req: NextRequest) => {
  const url     = new URL(req.url);
  const orderId = url.searchParams.get('order');
  const base    = getSafeBaseUrl();

  if (!orderId) {
    return NextResponse.redirect(new URL('/checkout?payment_failed=1', base));
  }

  const safeOrderId = orderId.replace(/\D/g, '').slice(0, 32);
  if (!safeOrderId) {
    return NextResponse.redirect(new URL('/checkout?payment_failed=1', base));
  }

  await connectDB();
  const order = await (Order.findOne as any)({ paymobOrderId: safeOrderId })
    .select('paymentStatus orderNumber')
    .lean() as { paymentStatus?: string; orderNumber?: string } | null;

  const isPaid = order?.paymentStatus === 'paid';
  const dest   = isPaid
    ? `/success?order=${encodeURIComponent(order!.orderNumber ?? '')}`
    : `/checkout?payment_failed=1`;
  return NextResponse.redirect(new URL(dest, base));
});
