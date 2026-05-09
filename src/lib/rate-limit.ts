// src/lib/rate-limit.ts — HemaV066
//
// ⚠️  TEST/DEVELOPMENT ONLY MODULE — DO NOT IMPORT IN PRODUCTION ROUTES ⚠️
//
// MED-03 FIX (V062): Production guard added at module load time.
// If this file is accidentally imported in a production route handler, it throws
// immediately with a clear error message directing the developer to use the
// correct production API: rateLimit() from @/lib/redis.
//
// V056 bug pattern has recurred (orders + coupons). This guard prevents recurrence.
//
// ⚠️  NOTICE (V056): This module uses a DIFFERENT API from src/lib/redis.ts::rateLimit.
//   This module:  rateLimit(identifier, RateLimitConfig) → { success, remaining, resetAt, retryAfterMs }
//   redis.ts:     rateLimit(key, max?, windowS?, failClosed?) → { blocked, remaining, retryAfterSec }
//
// Production API routes use src/lib/redis.ts. This module is used by standalone
// integration tests and load tests. Do NOT import this in app routes.
// See V056 bug fix in orders/route.ts and coupons/route.ts for context.
// Production-grade sliding-window rate limiter backed by Redis.
// Falls back to in-memory LRU when Redis is unavailable (degraded mode).
//
// Algorithm: Redis Lua script — atomic sliding window counter.
// Reference: https://redis.io/commands/evalsha/

// MED-03 FIX (V062): Hard production guard — throws immediately if this
// test-only module is imported in a production environment.
// In test/development, this guard is a no-op.
if (process.env.NODE_ENV === 'production') {
  throw new Error(
    '[rate-limit.ts] Test-only module imported in production. ' +
    'Import rateLimit from @/lib/redis in production routes. ' +
    'See V056 bug fix for context on the correct production API.'
  );
}

import { getRedis } from './redis';
import { logger }   from './logger';

export interface RateLimitConfig {
  /** Window size in seconds */
  windowSec: number;
  /** Max requests per window */
  max:       number;
  /** Optional key prefix (e.g. 'login', 'api') */
  prefix?:   string;
}

export interface RateLimitResult {
  success:      boolean;
  remaining:    number;
  resetAt:      number; // Unix epoch ms
  retryAfterMs: number;
}

// ── Lua sliding-window script ─────────────────────────────────────
// Atomically: increment count, set TTL on first hit, return count.
const SLIDING_WINDOW_SCRIPT = `
local key     = KEYS[1]
local window  = tonumber(ARGV[1])
local limit   = tonumber(ARGV[2])
local now     = tonumber(ARGV[3])
local expires = now + window * 1000

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window * 1000)
local count = redis.call('ZCARD', key)

if count < limit then
  redis.call('ZADD', key, now, now .. '-' .. math.random(1,1000000))
  redis.call('PEXPIRE', key, window * 1000)
  return {1, limit - count - 1, expires}
else
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local reset  = tonumber(oldest[2]) + window * 1000
  return {0, 0, reset}
end
`;

// ── In-memory fallback (no Redis) ─────────────────────────────────
const _memStore = new Map<string, { count: number; resetAt: number }>();
const MEM_MAX_KEYS = 10_000;

function memLimit(key: string, cfg: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  // Evict expired keys (simple cleanup — not per-request to keep it O(1))
  if (_memStore.size > MEM_MAX_KEYS) {
    for (const [k, v] of _memStore) {
      if (v.resetAt < now) _memStore.delete(k);
    }
  }
  const entry = _memStore.get(key);
  if (!entry || entry.resetAt < now) {
    _memStore.set(key, { count: 1, resetAt: now + cfg.windowSec * 1000 });
    return { success: true, remaining: cfg.max - 1, resetAt: now + cfg.windowSec * 1000, retryAfterMs: 0 };
  }
  if (entry.count >= cfg.max) {
    return { success: false, remaining: 0, resetAt: entry.resetAt, retryAfterMs: entry.resetAt - now };
  }
  entry.count++;
  return { success: true, remaining: cfg.max - entry.count, resetAt: entry.resetAt, retryAfterMs: 0 };
}

// ── Main rate-limit function ──────────────────────────────────────
export async function rateLimit(
  identifier: string,
  cfg: RateLimitConfig,
): Promise<RateLimitResult> {
  const key = `rl:${cfg.prefix ?? 'default'}:${identifier}`;

  try {
    const redis = await getRedis();
    if (!redis) return memLimit(key, cfg);

    const now = Date.now();
    const result = await redis.eval(
      SLIDING_WINDOW_SCRIPT,
      1,
      key,
      String(cfg.windowSec),
      String(cfg.max),
      String(now),
    ) as [number, number, number];

    const [allowed, remaining, resetAt] = result;
    return {
      success:      allowed === 1,
      remaining:    Math.max(0, remaining),
      resetAt,
      retryAfterMs: allowed === 1 ? 0 : Math.max(0, resetAt - now),
    };
  } catch (e) {
    logger.warn('[RateLimit] Redis error, falling back to memory', { error: String(e) });
    return memLimit(key, cfg);
  }
}

// ── Preset configs for common use cases ──────────────────────────
export const RATE_LIMITS = {
  /** General API calls per IP */
  api:         { windowSec: 60,   max: 120, prefix: 'api'      },
  /** Login attempts per IP */
  login:       { windowSec: 900,  max: 10,  prefix: 'login'    },
  /** Password reset requests per email */
  passwordReset:{ windowSec: 3600, max: 5,   prefix: 'pwreset' },
  /** Order creation per user */
  createOrder: { windowSec: 60,   max: 5,   prefix: 'order'    },
  /** Review submission per user */
  review:      { windowSec: 3600, max: 3,   prefix: 'review'   },
  /** Newsletter sign-up per IP */
  newsletter:  { windowSec: 3600, max: 3,   prefix: 'nl'       },
  /** Admin operations */
  admin:       { windowSec: 60,   max: 300, prefix: 'admin'    },
} as const satisfies Record<string, RateLimitConfig>;
