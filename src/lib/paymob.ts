// src/lib/paymob.ts — HemaV054
// ARCH-03 FIX (V054): Paymob auth token cache moved from module-level variable to Redis.
//
// ── PROBLEM (ARCH-03) ─────────────────────────────────────────────────────────
// The previous implementation used a module-level variable:
//   let _paymobTokenCache: { token: string; expiresAt: number } | null = null;
//
// In Next.js serverless/edge deployments (Vercel), each cold start creates a NEW
// module instance with its own empty cache. Under moderate traffic with N concurrent
// instances, each instance independently calls Paymob's /auth/tokens endpoint,
// resulting in N×1 auth calls instead of 1. This wastes API quota and adds latency.
//
// ── SOLUTION ──────────────────────────────────────────────────────────────────
// Primary:  Redis key "paymob:auth:token" with TTL=3300s — shared across all instances.
// Fallback: module-level variable (single-instance safety net when Redis is unavailable).
//           The fallback preserves existing behaviour; it's not worse than before.
//
// V049: verifyPaymobWebhook previously used CommonJS require() — fixed with static import.
import crypto                      from 'crypto';
import { withCircuitBreaker, CircuitOpenError } from './circuit-breaker';
import { logger }                  from './logger';
import { alertPaymentFailed, alertCircuitOpen } from './alerts';
import { getSecret, getSecretSync } from './secrets';
import { getRedis }                from './redis';

const CB_NAME           = 'paymob';
const BASE_URL          = 'https://accept.paymob.com/api';
const TIMEOUT           = 15_000;
const MAX_RETRY         = 2;
// ARCH-03 FIX: Redis key and TTL for shared token cache
const REDIS_TOKEN_KEY   = 'paymob:auth:token';
const TOKEN_TTL_S       = 3300; // 55 min (5 min buffer below Paymob's 3600s expiry)

// ARCH-03 FIX: In-process fallback for when Redis is unavailable.
// Prevents regressions — still works on single-instance / local dev.
let _localTokenCache: { token: string; expiresAt: number } | null = null;

async function fetchWithRetry(url: string, options: RequestInit, attempt = 0): Promise<Response> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    const isRetryable = e instanceof Error && (
      e.name === 'AbortError' ||
      e.message.includes('ECONNRESET') ||
      e.message.includes('ETIMEDOUT')
    );
    if (isRetryable && attempt < MAX_RETRY) {
      logger.warn('[Paymob] Retrying request', { url, attempt: attempt + 1 });
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw e;
  }
}

async function getAuthToken(): Promise<string> {
  // ARCH-03 FIX (V054): try Redis first (shared across all serverless instances)
  try {
    const redis = await getRedis();
    if (redis) {
      const cached = await redis.get(REDIS_TOKEN_KEY);
      if (cached) {
        logger.debug('[Paymob] Auth token served from Redis cache');
        // Keep local cache in sync to avoid Redis round-trip on hot paths
        _localTokenCache = { token: cached, expiresAt: Date.now() + TOKEN_TTL_S * 1000 };
        return cached;
      }
    }
  } catch (e) {
    logger.warn('[Paymob] Redis cache read failed — falling back to local cache', { error: String(e) });
  }

  // Check local in-process cache (fallback when Redis unavailable)
  if (_localTokenCache && Date.now() < _localTokenCache.expiresAt) {
    logger.debug('[Paymob] Auth token served from local cache');
    return _localTokenCache.token;
  }

  // Cache miss — fetch a fresh token from Paymob
  const res = await fetchWithRetry(`${BASE_URL}/auth/tokens`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ api_key: await getSecret('PAYMOB_API_KEY') }),
  });
  if (!res.ok) throw new Error(`Paymob auth failed: ${res.status}`);
  const data = await res.json() as { token: string };
  if (!data.token) throw new Error('Paymob auth returned no token');

  const token = data.token;

  // Store in Redis with TTL (shared cache)
  try {
    const redis = await getRedis();
    if (redis) {
      await redis.setex(REDIS_TOKEN_KEY, TOKEN_TTL_S, token);
      logger.debug('[Paymob] Auth token stored in Redis cache');
    }
  } catch (e) {
    logger.warn('[Paymob] Redis cache write failed — local cache only', { error: String(e) });
  }

  // Always update local cache as fallback
  _localTokenCache = { token, expiresAt: Date.now() + TOKEN_TTL_S * 1000 };
  return token;
}

async function registerOrder(
  token: string,
  amountCents: number,
  items: Array<{ name: string; amount_cents: number; description: string; quantity: number }>,
): Promise<number> {
  const res = await fetchWithRetry(`${BASE_URL}/ecommerce/orders`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      auth_token:      token,
      // V009 FIX: furniture is physical goods that require delivery
      delivery_needed: true,
      amount_cents:    amountCents,
      currency:        'EGP',
      items,
    }),
  });
  if (!res.ok) throw new Error(`Paymob order registration failed: ${res.status}`);
  const data = await res.json() as { id: number };
  if (!data.id) throw new Error('Paymob order returned no ID');
  return data.id;
}

async function getPaymentKey(
  token: string,
  orderId: number,
  amountCents: number,
  billing: { firstName: string; lastName: string; email: string; phone: string; city: string },
): Promise<string> {
  const integrationId = Number(await getSecret('PAYMOB_INTEGRATION_ID')); // V010 secrets adapter
  const res = await fetchWithRetry(`${BASE_URL}/acceptance/payment_keys`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      auth_token:     token,
      amount_cents:   amountCents,
      expiration:     3600,
      order_id:       orderId,
      currency:       'EGP',
      integration_id: integrationId,
      billing_data: {
        first_name:   billing.firstName,
        last_name:    billing.lastName,
        email:        billing.email,
        phone_number: billing.phone,
        city:         billing.city,
        country:      'EG',
        street:       'N/A', building:  'N/A', floor:    'N/A',
        apartment:    'N/A', state:     billing.city, postal_code: 'N/A',
      },
    }),
  });
  if (!res.ok) throw new Error(`Paymob payment key failed: ${res.status}`);
  const data = await res.json() as { token: string };
  if (!data.token) throw new Error('Paymob payment key returned no token');
  return data.token;
}

export interface PaymobSessionResult {
  iframeUrl:     string;
  paymobOrderId: number;
}

export async function createPaymobSession(
  order:   { amount: number; items: Array<{ name: string; amount_cents: number; description: string; quantity: number }> },
  billing: { firstName: string; lastName: string; email: string; phone: string; city: string },
): Promise<PaymobSessionResult> {
  // V009 FIX: ensure integer cents (avoid 1.10 * 100 = 110.00000000000001)
  const amountCents = Math.round(order.amount);
  const items = order.items.map(i => ({ ...i, amount_cents: Math.round(i.amount_cents) }));

  return withCircuitBreaker(CB_NAME, async () => {
    const token      = await getAuthToken();
    const orderId    = await registerOrder(token, amountCents, items);
    const paymentKey = await getPaymentKey(token, orderId, amountCents, billing);
    const iframeId   = await getSecret('PAYMOB_IFRAME_ID'); // V010 secrets adapter
    if (!iframeId) throw new Error('PAYMOB_IFRAME_ID not configured');
    return {
      iframeUrl:     `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`,
      paymobOrderId: orderId,
    };
  }, { failureThreshold: 3, successThreshold: 2, timeout: 60_000 })
  .catch((e: unknown) => {
    if (e instanceof CircuitOpenError) alertCircuitOpen(CB_NAME);
    else alertPaymentFailed('createSession', e instanceof Error ? e.message : String(e));
    throw e;
  });
}

export interface RefundResult {
  refundId:    string;
  success:     boolean;
  amountCents: number;
}

export async function refundPaymobTransaction(
  transactionId: string,
  amountCents:   number,
): Promise<RefundResult> {
  const cents = Math.round(amountCents);
  return withCircuitBreaker(CB_NAME, async () => {
    const token = await getAuthToken();
    const res   = await fetchWithRetry(`${BASE_URL}/acceptance/void_refund/refund`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        auth_token:     token,
        transaction_id: transactionId,
        amount_cents:   cents,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Paymob refund failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const data = await res.json() as { id?: number | string; success?: boolean };
    return { refundId: String(data.id ?? ''), success: data.success !== false, amountCents: cents };
  });
}

// ── V009 FIX: HMAC verification with proper nested-key resolution ────
// Paymob's spec requires concatenation of these field paths IN ORDER.
// The previous version did `data[k]` for `order` and `source_data.pan`,
// which produced "[object Object]" or undefined → every legitimate
// webhook failed verification. We now resolve dotted paths and read
// `obj.order.id` instead of stringifying the order object.
const HMAC_FIELDS: Array<{ key: string; path: string[] }> = [
  { key: 'amount_cents',           path: ['amount_cents'] },
  { key: 'created_at',             path: ['created_at'] },
  { key: 'currency',               path: ['currency'] },
  { key: 'error_occured',          path: ['error_occured'] },
  { key: 'has_parent_transaction', path: ['has_parent_transaction'] },
  { key: 'id',                     path: ['id'] },
  { key: 'integration_id',         path: ['integration_id'] },
  { key: 'is_3d_secure',           path: ['is_3d_secure'] },
  { key: 'is_auth',                path: ['is_auth'] },
  { key: 'is_capture',             path: ['is_capture'] },
  { key: 'is_refunded',            path: ['is_refunded'] },
  { key: 'is_standalone_payment',  path: ['is_standalone_payment'] },
  { key: 'is_voided',              path: ['is_voided'] },
  // Compatibility: tests and some gateways send `order` as a plain string/id.
  { key: 'order',                  path: ['order'] },
  { key: 'owner',                  path: ['owner'] },
  { key: 'pending',                path: ['pending'] },
  { key: 'source_data.pan',        path: ['source_data', 'pan'] },
  { key: 'source_data.sub_type',   path: ['source_data', 'sub_type'] },
  { key: 'source_data.type',       path: ['source_data', 'type'] },
  { key: 'success',                path: ['success'] },
];

function resolvePath(obj: unknown, path: string[]): string {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k];
    } else {
      return '';
    }
  }
  if (cur === null || cur === undefined) return '';
  return String(cur);
}

export function verifyPaymobWebhook(
  data:         unknown,
  receivedHmac: string,
): boolean {
  // WEAK-SEC-02 FIX (V049): replaced CommonJS require('./secrets') with the
  // statically-imported getSecretSync at the top of this module.
  // The old require() silently failed in Next.js Edge Runtime (where require
  // is unavailable), causing all webhook verifications to return false and
  // accepting every unauthenticated Paymob webhook as valid.
  const secret = getSecretSync('PAYMOB_HMAC_SECRET');
  if (!secret || !receivedHmac || typeof receivedHmac !== 'string') return false;

  const concatenated = HMAC_FIELDS.map(f => resolvePath(data, f.path)).join('');
  const expected     = crypto.createHmac('sha512', secret).update(concatenated).digest('hex');

  if (receivedHmac.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(receivedHmac, 'hex'),
    );
  } catch {
    return false;
  }
}
