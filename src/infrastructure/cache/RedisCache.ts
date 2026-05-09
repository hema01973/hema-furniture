// src/infrastructure/cache/RedisCache.ts — HemaV050
// Generic Redis-backed cache with type safety and graceful degradation.
// Use this instead of raw redis.get/set everywhere to get:
//   - Automatic JSON serialisation / deserialisation
//   - TTL management
//   - Tag-based invalidation (e.g. invalidate all "product:*" keys)
//   - Fallback to compute when Redis is unavailable

import { getRedis } from '@/lib/redis';
import { logger }   from '@/lib/logger';

export interface CacheOptions {
  /** TTL in seconds. Default: 300 (5 min) */
  ttl?:  number;
  /** Optional namespace prefix */
  ns?:   string;
}

const DEFAULT_TTL = 300;

export class RedisCache {
  private readonly ns: string;

  constructor(namespace: string) {
    this.ns = namespace;
  }

  private key(k: string): string {
    return `cache:${this.ns}:${k}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const redis = await getRedis();
      if (!redis) return null;
      const raw = await redis.get(this.key(key));
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (e) {
      logger.warn('[Cache] get error', { key, error: String(e) });
      return null;
    }
  }

  async set<T>(key: string, value: T, opts: CacheOptions = {}): Promise<void> {
    try {
      const redis = await getRedis();
      if (!redis) return;
      const ttl = opts.ttl ?? DEFAULT_TTL;
      await redis.setex(this.key(key), ttl, JSON.stringify(value));
    } catch (e) {
      logger.warn('[Cache] set error', { key, error: String(e) });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const redis = await getRedis();
      if (!redis) return;
      await redis.del(this.key(key));
    } catch (e) {
      logger.warn('[Cache] delete error', { key, error: String(e) });
    }
  }

  /** Delete all keys matching a glob pattern within this namespace */
  async deletePattern(pattern: string): Promise<void> {
    try {
      const redis = await getRedis();
      if (!redis) return;
      const keys = await redis.keys(this.key(pattern));
      if (keys.length > 0) await redis.del(...keys);
    } catch (e) {
      logger.warn('[Cache] deletePattern error', { pattern, error: String(e) });
    }
  }

  /**
   * Cache-aside pattern: return cached value or compute and cache it.
   * Falls back to computing the value if Redis is unavailable.
   */
  async remember<T>(
    key: string,
    compute: () => Promise<T>,
    opts: CacheOptions = {},
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await compute();
    await this.set(key, value, opts);
    return value;
  }
}

// ── Pre-built caches per domain ───────────────────────────────────
export const productCache  = new RedisCache('product');
export const orderCache    = new RedisCache('order');
export const userCache     = new RedisCache('user');
export const analyticsCache = new RedisCache('analytics');
export const couponCache   = new RedisCache('coupon');

// ── TTL presets (seconds) ─────────────────────────────────────────
export const CACHE_TTL = {
  productList:    300,   // 5 min — refreshed on product update
  productDetail:  600,   // 10 min
  userProfile:    120,   // 2 min
  analytics:      3600,  // 1 hr
  couponValidate: 60,    // 1 min — must stay fresh
} as const;
