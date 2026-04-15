// src/lib/redis.ts — v2: fail-closed for auth routes, singleton, sliding-window
import type { Redis as RedisType } from 'ioredis';

declare global { var _redisClient: RedisType | null; }
let client: RedisType | null = global._redisClient ?? null;

export async function getRedis(): Promise<RedisType | null> {
  if (!process.env.REDIS_URL) return null;
  if (client && (client.status === 'ready' || client.status === 'connecting')) return client;
  const { default: Redis } = await import('ioredis');
  client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck:     false,
    lazyConnect:          true,
    connectTimeout:       3000,
    commandTimeout:       2000,
  });
  client.on('error', () => { /* silence — handled in rateLimit */ });
  try { await client.connect(); } catch { /* handled below */ }
  if (process.env.NODE_ENV !== 'production') global._redisClient = client;
  return client;
}

const IN_MEMORY = new Map<string, { count: number; resetAt: number }>();

/**
 * @param failClosed  true = BLOCK if Redis is down (use for auth/password routes)
 *                    false = allow through if Redis is down (general routes)
 */
export async function rateLimit(
  ip: string,
  max       = parseInt(process.env.RATE_LIMIT_MAX            ?? '100'),
  windowS   = parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS ?? '60'),
  failClosed = false,
): Promise<boolean> {
  const redis = await getRedis();

  if (redis && redis.status === 'ready') {
    const key  = `rl:${ip}`;
    const now  = Date.now();
    const floor = now - windowS * 1000;
    try {
      const pipe = redis.pipeline();
      pipe.zremrangebyscore(key, 0, floor);
      pipe.zadd(key, now, `${now}:${Math.random()}`);
      pipe.zcard(key);
      pipe.expire(key, windowS + 1);
      const results = await pipe.exec();
      const count = (results?.[2]?.[1] ?? 0) as number;
      return count > max;
    } catch {
      return failClosed; // Block on Redis error if failClosed=true
    }
  }

  // Redis not ready
  if (failClosed && process.env.REDIS_URL) {
    // Redis configured but down — protect auth routes
    return true;
  }

  // In-memory fallback
  const now = Date.now();
  const rec = IN_MEMORY.get(ip);
  if (!rec || now > rec.resetAt) {
    IN_MEMORY.set(ip, { count: 1, resetAt: now + windowS * 1000 });
    return false;
  }
  if (rec.count >= max) return true;
  rec.count++;
  return false;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = await getRedis();
  if (!redis || redis.status !== 'ready') return null;
  try { const v = await redis.get(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}

export async function cacheSet(key: string, value: unknown, ttl = 300): Promise<void> {
  const redis = await getRedis();
  if (!redis || redis.status !== 'ready') return;
  try { await redis.set(key, JSON.stringify(value), 'EX', ttl); } catch { /* ignore */ }
}

export async function cacheDel(key: string): Promise<void> {
  const redis = await getRedis();
  if (!redis || redis.status !== 'ready') return;
  try { await redis.del(key); } catch { /* ignore */ }
}
