// src/lib/redis.ts — HemaV066
// V064 FIX-MED-03: Sentry.captureMessage fires (at most once per process) when Redis
//   degrades to in-memory fallback. Uses a module-level boolean to prevent alert storms.
// V061 FIX-C: Degradation mode logging — clear structured logs when Redis unavailable.
//   - getRedis() returns null on failure AND emits structured degradation event.
//   - getRedisOrThrow() throws with clear message when Redis is required.
//   - Degradation events are logged at ERROR level with impact metadata.
//
// V060 FIX-C: Explicit Redis failure strategy documented and enforced.
//   - failClosed=true (auth/payment routes): Redis DOWN → block request. No bypass.
//   - failClosed=false (general routes): Redis DOWN → in-memory fallback limiter.
//   - Local in-memory fallback uses sliding-window carry-over (V050 fix preserved).
//   - getRedisOrThrow() helper added: for routes that MUST have Redis (fail-closed hard).
//
// FIX (V050): replaced all `(client as any)?.status` casts with a type-safe
//             isClientReady() helper — ioredis exposes `status` on the instance
//             but the TypeScript type doesn't declare it on the interface.
import type { Redis as RedisType } from 'ioredis';
import { logger } from './logger';

// MED-03 FIX (V064): Module-level flag — Sentry alert fires at most ONCE per process
// lifetime to prevent alert storms during sustained Redis outages.
let _sentryDegradationAlertFired = false;

// ── Singleton client ──────────────────────────────────────────────
declare global { var _hemaRedis: RedisType | null; }

let _client: RedisType | null = global._hemaRedis ?? null;
let _connecting = false;

/** Type-safe helper — ioredis exposes .status but TypeScript doesn't model it on the interface */
function isClientReady(client: RedisType | null): boolean {
  if (!client) return false;
  // ioredis Redis instances always have a `status` property at runtime
  return (client as RedisType & { status: string }).status === 'ready';
}

export async function getRedis(): Promise<RedisType | null> {
  if (!process.env.REDIS_URL) return null;

  // Return healthy existing client
  if (isClientReady(_client)) return _client;
  if (_connecting) {
    // Wait briefly for in-progress connection
    await new Promise(r => setTimeout(r, 200));
    return isClientReady(_client) ? _client : null;
  }

  _connecting = true;
  try {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest:  0,     // fail fast — don't block requests
      enableReadyCheck:      true,
      lazyConnect:           true,
      connectTimeout:        3_000,
      commandTimeout:        2_000,
      reconnectOnError:      (err) => err.message.includes('READONLY'), // Atlas failover
      retryStrategy:         (times) => times > 3 ? null : Math.min(times * 200, 2_000),
    });

    client.on('error',  (e) => logger.warn('[Redis] Error', { error: e.message }));
    client.on('ready',  ()  => logger.info('[Redis] Connected'));
    client.on('close',  ()  => logger.warn('[Redis] Connection closed'));

    await client.connect();
    _client = client;
    if (process.env.NODE_ENV !== 'production') global._hemaRedis = client;
  } catch (e) {
    logger.error('[Redis] Connection failed — degraded mode active', {
      error:   String(e),
      impact:  'rate-limiting-in-memory, distributed-session-blacklist-unavailable, idempotency-keys-unavailable',
      action:  'Check REDIS_URL, Redis cluster health, and network connectivity. Routes using getRedisOrThrow() will return 503.',
    });
    // MED-03 FIX (V064): Emit Sentry alert when Redis degrades to in-memory fallback.
    // Fires at most once per process lifetime (flag prevents alert storms).
    if (!_sentryDegradationAlertFired) {
      _sentryDegradationAlertFired = true;
      try {
        const Sentry = await import('@sentry/nextjs');
        Sentry.captureMessage('Redis degraded — falling back to memory', { level: 'error' });
      } catch { /* Sentry unavailable — already logged above */ }
    }
    _client = null;
  } finally {
    _connecting = false;
  }

  return isClientReady(_client) ? _client : null;
}

/**
 * V060 FIX-C: getRedisOrThrow — hard fail-closed Redis access for routes that
 * MUST NOT fall back to in-memory (e.g. distributed session blacklist checks,
 * payment idempotency keys). Throws if Redis is DOWN or REDIS_URL is not set.
 *
 * Use rateLimit(..., failClosed=true) for rate limiting; use this for operations
 * where data correctness (not just limiting) depends on Redis being available.
 */
export async function getRedisOrThrow(): Promise<RedisType> {
  const client = await getRedis();
  if (!client) {
    throw new Error(
      '[Redis] Connection unavailable and this operation requires Redis (fail-closed). ' +
      'Check REDIS_URL and Redis cluster health.'
    );
  }
  return client;
}

// ── In-memory fallback (single-instance safety net) ──────────────
interface MemRecord { value: string; expiresAt: number; }
// V009 FIX: enforce a hard cap so a flood of unique keys (e.g. attacker-driven
// rate-limit keys with random suffixes) cannot OOM the process when Redis is
// unavailable. When the cap is hit we evict the oldest 10% of entries.
const MEM_STORE_MAX = 10_000;
const MEM_STORE = new Map<string, MemRecord>();

function memSet(key: string, rec: MemRecord): void {
  if (MEM_STORE.size >= MEM_STORE_MAX) {
    // Drop oldest insertion order — Map preserves insertion order
    const drop = Math.ceil(MEM_STORE_MAX * 0.1);
    let i = 0;
    for (const k of MEM_STORE.keys()) {
      MEM_STORE.delete(k);
      if (++i >= drop) break;
    }
  }
  MEM_STORE.set(key, rec);
}

// Cleanup expired in-memory entries every 60s
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of MEM_STORE) { if (v.expiresAt < now) MEM_STORE.delete(k); }
  }, 60_000).unref?.();
}

// ── Rate limiting — sliding window ───────────────────────────────
/**
 * @param key        Identifier (typically `${ip}:${route}`)
 * @param max        Max requests per window
 * @param windowS    Window in seconds
 * @param failClosed true → block if Redis unavailable (auth routes)
 *                   false → fall through to in-memory (general routes)
 */
// ARCH-002 FIX (HemaV052): RateLimitResult carries retryAfterSec and remaining
// so callers can emit RFC 6585-compliant Retry-After and X-RateLimit-* headers.
export interface RateLimitResult {
  blocked:       boolean;
  remaining:     number;   // requests left in current window
  retryAfterSec: number;   // seconds until limit resets (0 if not blocked)
}

export async function rateLimit(
  key:        string,
  max        = parseInt(process.env.RATE_LIMIT_MAX            ?? '100'),
  windowS    = parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS ?? '60'),
  failClosed = false,
): Promise<RateLimitResult> {
  const redis = await getRedis();

  // ── Redis path ────────────────────────────────────────────────
  if (redis) {
    const rlKey = `rl:${key}`;
    const now   = Date.now();
    const floor = now - windowS * 1_000;
    try {
      const pipe = redis.pipeline();
      pipe.zremrangebyscore(rlKey, 0, floor);
      pipe.zadd(rlKey, now, `${now}:${Math.random()}`);
      pipe.zcard(rlKey);
      pipe.pexpire(rlKey, windowS * 1_000 + 500);
      // Get the oldest entry score to compute reset time
      pipe.zrange(rlKey, 0, 0, 'WITHSCORES');
      const results = await pipe.exec();
      const count     = (results?.[2]?.[1] ?? 0) as number;
      const oldestRaw = (results?.[4]?.[1] ?? []) as string[];
      const oldestTs  = oldestRaw[1] != null ? parseFloat(oldestRaw[1]) : now;
      const resetMs   = oldestTs + windowS * 1_000;
      const retryAfterSec = Math.max(0, Math.ceil((resetMs - now) / 1000));
      const remaining     = Math.max(0, max - count);

      if (count > max) {
        logger.warn('[RateLimit] Redis blocked', { key, count, max });
        return { blocked: true, remaining: 0, retryAfterSec };
      }
      return { blocked: false, remaining, retryAfterSec: 0 };
    } catch (e) {
      logger.warn('[RateLimit] Redis pipeline failed', { error: String(e), failClosed });
      // Honour fail-safe contract
      return { blocked: failClosed, remaining: failClosed ? 0 : max, retryAfterSec: failClosed ? windowS : 0 };
    }
  }

  // ── No Redis: failClosed → block if REDIS_URL was expected ───
  if (failClosed && process.env.REDIS_URL) {
    logger.warn('[RateLimit] failClosed: Redis unavailable, blocking request', { key });
    return { blocked: true, remaining: 0, retryAfterSec: windowS };
  }

  // ── In-memory fallback ────────────────────────────────────────
  // FIX #8 (V031): The original fixed-window counter allowed a burst of 2×max
  // requests by sending max at the tail of one window and max at the head of
  // the next. Defense: halve the effective limit at window boundary by tracking
  // a "previousCount" that decays linearly within the next window.
  // This approximates a sliding window without O(n) per-request storage.
  const now    = Date.now();
  const memKey = `rl:${key}`;
  const rec    = MEM_STORE.get(memKey);

  if (!rec || now > rec.expiresAt) {
    const prevCount  = rec ? parseInt(rec.value, 10) : 0;
    const windowMs   = windowS * 1_000;
    const carryOver  = rec
      ? Math.round(prevCount * (1 - (now - (rec.expiresAt - windowMs)) / windowMs))
      : 0;
    const initial    = Math.max(1, carryOver + 1);
    const expiresAt  = now + windowMs;
    memSet(memKey, { value: String(initial), expiresAt });
    const retryAfterSec = Math.ceil((expiresAt - now) / 1000);
    if (initial > max) {
      logger.warn('[RateLimit] In-memory blocked (sliding carry)', { key, count: initial, max });
      return { blocked: true, remaining: 0, retryAfterSec };
    }
    return { blocked: false, remaining: Math.max(0, max - initial), retryAfterSec: 0 };
  }

  const count = parseInt(rec.value, 10) + 1;
  rec.value   = String(count);
  const retryAfterSec = Math.max(0, Math.ceil((rec.expiresAt - now) / 1000));
  if (count > max) {
    logger.warn('[RateLimit] In-memory blocked', { key, count, max });
    return { blocked: true, remaining: 0, retryAfterSec };
  }
  return { blocked: false, remaining: Math.max(0, max - count), retryAfterSec: 0 };
}

// ── Typed cache helpers ───────────────────────────────────────────

/** Get a cached value. Returns null on miss or Redis failure. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = await getRedis();

  if (redis) {
    try {
      const raw = await redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (e) {
      logger.warn('[Cache] GET failed', { key, error: String(e) });
      return null;
    }
  }

  // In-memory fallback
  const rec = MEM_STORE.get(key);
  if (!rec || Date.now() > rec.expiresAt) { MEM_STORE.delete(key); return null; }
  try { return JSON.parse(rec.value) as T; } catch { return null; }
}

/** Set a cached value with TTL in seconds. */
export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  const serialized = JSON.stringify(value);
  const redis      = await getRedis();

  if (redis) {
    try { await redis.set(key, serialized, 'EX', ttlSeconds); return; }
    catch (e) { logger.warn('[Cache] SET failed', { key, error: String(e) }); }
  }

  // In-memory fallback
  MEM_STORE.set(key, { value: serialized, expiresAt: Date.now() + ttlSeconds * 1_000 });
}

/** Delete one or more cache keys. */
export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const redis = await getRedis();

  if (redis) {
    try { await redis.del(...keys); return; }
    catch (e) { logger.warn('[Cache] DEL failed', { keys, error: String(e) }); }
  }

  keys.forEach(k => MEM_STORE.delete(k));
}

/** Delete all keys matching a pattern prefix (uses SCAN to avoid blocking). */
export async function cacheDelPattern(pattern: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) {
    for (const k of MEM_STORE.keys()) { if (k.startsWith(pattern)) MEM_STORE.delete(k); }
    return;
  }
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${pattern}*`, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  } catch (e) {
    logger.warn('[Cache] SCAN+DEL failed', { pattern, error: String(e) });
  }
}

/** Increment a counter and get its new value (atomic). */
export async function cacheIncr(key: string, ttlSeconds?: number): Promise<number> {
  const redis = await getRedis();
  if (redis) {
    try {
      const val = await redis.incr(key);
      if (ttlSeconds && val === 1) await redis.expire(key, ttlSeconds);
      return val;
    } catch { /* fall through */ }
  }
  const rec   = MEM_STORE.get(key);
  const count = rec ? parseInt(rec.value, 10) + 1 : 1;
  MEM_STORE.set(key, {
    value:     String(count),
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1_000 : Infinity,
  });
  return count;
}
