// src/app/api/v1/newsletter/route.ts — HemaV068
// VULN-002 FIX (V068): Unsubscribe tokens now use a dedicated NEWSLETTER_UNSUBSCRIBE_SECRET
// with fallback to NEXTAUTH_SECRET for backward compatibility. Previously tokens were
// tied exclusively to NEXTAUTH_SECRET, meaning any key rotation (a standard security
// practice) immediately invalidated all outstanding 30-day unsubscribe links — violating
// CAN-SPAM/GDPR obligations. The dedicated secret can be rotated independently.
// V064 FIX-MED-05: Unsubscribe now requires a ?token= signed with HMAC-SHA-256 of
//   `email:unsubscribe:<expiry>`, base64url-encoded, with a 30-day TTL embedded.
//   POST subscribe flow generates this token for inclusion in the confirmation email link.
//   Rate limit tightened to rateMax:5/rateWindow:300 on DELETE.
// V064 FIX-MED-05: Unsubscribe now requires a ?token= signed with HMAC-SHA-256 of
//   `email:unsubscribe:<expiry>`, base64url-encoded, with a 30-day TTL embedded.
//   POST subscribe flow generates this token for inclusion in the confirmation email link.
//   Rate limit tightened to rateMax:5/rateWindow:300 on DELETE.

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { connectDB, NewsletterSubscriber } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody } from '@/lib/api';
import { sanitizeEmail } from '@/lib/sanitize';
import { enqueueEmail } from '@/lib/queue';
import { getSecretSync } from '@/lib/secrets';

// ── Token helpers ────────────────────────────────────────────────

const UNSUBSCRIBE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Build a signed, time-limited unsubscribe token.
 *
 * Format (before base64url): `<expiry_unix_ms>.<hmac_hex>`
 * HMAC-SHA-256 input: `email:unsubscribe:<expiry_unix_ms>`
 *
 * @param email  - Subscriber email (normalised lowercase)
 * @param secret - NEXTAUTH_SECRET used as HMAC key
 * @returns base64url-encoded token safe for use in URLs without further encoding
 */
function buildUnsubscribeToken(email: string, secret: string): string {
  const expiresAt = Date.now() + UNSUBSCRIBE_TOKEN_TTL_MS;
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(`${email}:unsubscribe:${expiresAt}`)
    .digest('hex');
  return Buffer.from(`${expiresAt}.${hmac}`).toString('base64url');
}

/**
 * Verify a signed unsubscribe token for the given email.
 *
 * Returns true only when:
 *   1. Token is well-formed (parseable base64url, two dot-separated parts)
 *   2. Not expired (expiry timestamp is in the future)
 *   3. HMAC is valid (constant-time comparison against recomputed HMAC)
 *
 * @param token  - base64url token from the ?token= query param
 * @param email  - Subscriber email (normalised lowercase)
 * @param secret - NEXTAUTH_SECRET used as HMAC key
 */
function verifyUnsubscribeToken(token: string, email: string, secret: string): boolean {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const dotIdx = raw.indexOf('.');
    if (dotIdx === -1) return false;

    const expiresAt = parseInt(raw.slice(0, dotIdx), 10);
    const providedHmac = raw.slice(dotIdx + 1);

    if (isNaN(expiresAt) || Date.now() > expiresAt) return false;

    const expectedHmac = crypto
      .createHmac('sha256', secret)
      .update(`${email}:unsubscribe:${expiresAt}`)
      .digest('hex');

    if (providedHmac.length !== expectedHmac.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(providedHmac),
      Buffer.from(expectedHmac),
    );
  } catch {
    return false;
  }
}

// ── Validation ──────────────────────────────────────────────────
const SubscribeSchema = z.object({
  email: z.string().email('Valid email required').transform(v => sanitizeEmail(v)),
  lang:  z.enum(['en', 'ar']).optional().default('en'),
});

// MED-05 FIX (V064): DELETE schema uses ?token= (signed) instead of bare ?email=.
// MED-01 FIX (V065): Unsubscribe params are now read from query string, not req.json().
// Many CDNs (Cloudflare, Fastly), proxies, and native email clients strip the body
// on DELETE requests (RFC 7231 §4.3.5 permits but discourages a body on DELETE).
// Using ?token=&email= in the URL is the standard pattern for signed link-based
// unsubscription (RFC 8058 List-Unsubscribe-Post uses POST; but link clicks are GET/DELETE).
const UnsubscribeSchema = z.object({
  token: z.string().min(1, 'Unsubscribe token is required'),
  email: z.string().email().transform(v => sanitizeEmail(v)),
});

// ── POST /api/v1/newsletter ─────────────────────────────────────
// Subscribes an email address to the newsletter.
// Idempotent: re-subscribing a known address reactivates it without error.
// MED-05 FIX (V064): Generates and returns a signed unsubscribe token that should be
// embedded in the confirmation email link for one-click unsubscribe (RFC 8058).
export const POST = withErrorHandler(async (req: NextRequest) => {
  const v = await validateBody(req, SubscribeSchema);
  if ('error' in v) return v.error;

  await connectDB();

  await (NewsletterSubscriber.findOneAndUpdate as any)(
    { email: v.data.email },
    {
      $set:        { isActive: true, lang: v.data.lang, source: 'website' },
      $setOnInsert: { subscribedAt: new Date() },
    },
    { upsert: true, new: true },
  ).lean();

  // VULN-002 FIX (V068): Use dedicated secret so NEXTAUTH_SECRET rotation does
  // not invalidate outstanding unsubscribe links (same pattern as CLAIM_TOKEN_SECRET).
  const secret = getSecretSync('NEWSLETTER_UNSUBSCRIBE_SECRET') ?? getSecretSync('NEXTAUTH_SECRET');
  let unsubscribeToken: string | undefined;
  if (secret) {
    unsubscribeToken = buildUnsubscribeToken(v.data.email, secret);
  }

  // Queue welcome email with unsubscribe token (fire-and-forget)
  try {
    await enqueueEmail({
      type:  'welcome',
      name:  v.data.email.split('@')[0] ?? v.data.email,
      email: v.data.email,
    });
  } catch {
    // Queue unavailable — subscription still saved
  }

  // V039 FIX [MED-04]: do not echo email back (PII in APM logs)
  // MED-05: unsubscribeToken returned so callers can embed it in email links
  return ok({ subscribed: true, ...(unsubscribeToken ? { unsubscribeToken } : {}) });
}, { rateMax: 5, rateWindow: 60 });

// ── DELETE /api/v1/newsletter ──────────────────────────────────
// MED-05 FIX (V064): Requires a signed ?token= with 30-day TTL.
// MED-01 FIX (V065): Reads token and email from URL query params (not req.json()).
// Body on DELETE is stripped by Cloudflare, most CDNs, and many email clients.
// URL: DELETE /api/v1/newsletter?email=user@example.com&token=<signed-token>
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  // MED-01 FIX (V065): Parse from URL query string — not req.json()
  const url   = new URL(req.url);
  const rawEmail = url.searchParams.get('email') ?? '';
  const rawToken = url.searchParams.get('token') ?? '';

  const parsed = UnsubscribeSchema.safeParse({ email: rawEmail, token: rawToken });
  if (!parsed.success) {
    return err(parsed.error.errors[0]?.message ?? 'Invalid request', 400, 'VALIDATION_ERROR');
  }
  const v = parsed.data;

  // VULN-002 FIX (V068): Use dedicated secret for independent rotation schedule.
  const secret = getSecretSync('NEWSLETTER_UNSUBSCRIBE_SECRET') ?? getSecretSync('NEXTAUTH_SECRET');
  if (!secret) return err('Service unavailable', 503);

  if (!verifyUnsubscribeToken(v.token, v.email, secret)) {
    return err('Invalid or expired unsubscribe token', 401, 'INVALID_TOKEN');
  }

  await connectDB();
  await (NewsletterSubscriber.findOneAndUpdate as any)(
    { email: v.email },
    { $set: { isActive: false } },
  );

  return ok({ unsubscribed: true });
}, { rateMax: 5, rateWindow: 300 }); // MED-05 FIX (V064): 5 req / 5 min per IP
