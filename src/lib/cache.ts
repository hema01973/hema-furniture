// src/... — HemaV050: unified cache layer with Redis + in-memory fallback
// ──────────────────────────────────────────────────────────────────
// Single API for read-through caching:
//
//   const products = await cached('products:active', 60, () => (Product.find as any)(...));
//
// Backed by Redis when available, with a bounded in-memory LRU fallback so a
// single-instance install (or Redis outage) still gets *some* cache benefit
// without unbounded memory growth.
//
// Invalidation is explicit:
//   • `invalidate(key)`          — drop one entry
//   • `invalidateByTag(tag)`     — drop all entries that registered this tag
//
// Tags are tracked in Redis via a SET per tag (cheap O(1) add/remove). When
// invalidating a tag, we LPOP all members and DEL them. The in-memory
// fallback uses a parallel JS Map<tag, Set<key>>.
//
// Why not React's `unstable_cache`?
//   • Process-local only (no cross-instance sharing).
//   • Tied to Next.js request lifecycle — useless from BullMQ workers.
//   • Cannot be invalidated from outside React Server Components.
//
// V010 NEW.

import { getRedis } from './redis';
import { logger }   from './logger';

// ── Bounded in-memory LRU (fallback when Redis is down) ──────────
const MEM_CACHE_MAX = parseInt(process.env.CACHE_MEM_MAX ?? '5000');
interface MemEntry { value: string; expiresAt: number; tags: string[]; }
const _mem    = new Map<string, MemEntry>();
const _byTag  = new Map<string, Set<string>>();

function memSet(key: string, value: string, ttlSec: number, tags: string[]): void {
  if (_mem.size >= MEM_CACHE_MAX) {
    // Evict oldest 10% (Map preserves insertion order)
    const drop = Math.ceil(MEM_CACHE_MAX * 0.1);
    let n = 0;
    for (const k of _mem.keys()) {
      const e = _mem.get(k);
      if (e) for (const t of e.tags) _byTag.get(t)?.delete(k);
      _mem.delete(k);
      if (++n >= drop) break;
    }
  }
  _mem.set(key, { value, expiresAt: Date.now() + ttlSec * 1000, tags });
  for (const t of tags) {
    if (!_byTag.has(t)) _byTag.set(t, new Set());
    _byTag.get(t)!.add(key);
  }
}

function memGet(key: string): string | null {
  const e = _mem.get(key);
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    _mem.delete(key);
    for (const t of e.tags) _byTag.get(t)?.delete(key);
    return null;
  }
  return e.value;
}

// Cleanup expired in-memory entries every 60s
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, e] of _mem) {
      if (e.expiresAt < now) {
        _mem.delete(k);
        for (const t of e.tags) _byTag.get(t)?.delete(k);
      }
    }
  }, 60_000).unref?.();
}

// ── Public API ───────────────────────────────────────────────────

export interface CacheOpts {
  /** Tags for bulk invalidation. e.g. `['products', 'product:123']` */
  tags?: string[];
  /** Skip cache entirely (force loader) — useful in admin "preview" requests */
  bypass?: boolean;
}

/**
 * Read-through cache. Returns the cached value if present, otherwise calls
 * `loader`, stores the result for `ttlSec` seconds, and returns it.
 *
 * Failures of the cache layer NEVER prevent the loader from running — the
 * function is effectively transparent if Redis is down and memory is full.
 */
export async function cached<T>(
  key:    string,
  ttlSec: number,
  loader: () => Promise<T>,
  opts:   CacheOpts = {},
): Promise<T> {
  if (opts.bypass) return loader();

  const tags = opts.tags ?? [];
  const cacheKey = `c:${key}`;

  // ── Try Redis ───────────────────────────────────────────────
  const redis = await getRedis().catch(() => null);
  if (redis) {
    try {
      const hit = await redis.get(cacheKey);
      if (hit !== null) {
        return JSON.parse(hit) as T;
      }
    } catch (e) {
      logger.warn('[Cache] redis get failed', { key, error: String(e) });
    }
  }

  // ── Try in-memory fallback ─────────────────────────────────
  const memHit = memGet(cacheKey);
  if (memHit !== null) {
    try { return JSON.parse(memHit) as T; } catch { /* drop corrupt entry */ }
  }

  // ── Miss → loader ──────────────────────────────────────────
  const value = await loader();
  const serialised = JSON.stringify(value);

  // Best-effort writes — don't await Redis if it's slow, but DO await
  // the local memory store so we get repeat-hit benefit immediately.
  memSet(cacheKey, serialised, ttlSec, tags);

  if (redis) {
    redis.set(cacheKey, serialised, 'EX', ttlSec).catch((e: unknown) =>
      logger.warn('[Cache] redis set failed', { key, error: String(e) }));
    if (tags.length) {
      const pipe = redis.pipeline();
      for (const t of tags) pipe.sadd(`tag:${t}`, cacheKey);
      pipe.exec().catch(() => {});
    }
  }

  return value;
}

/** Drop a single key from both Redis and memory. */
export async function invalidate(key: string): Promise<void> {
  const cacheKey = `c:${key}`;
  const e = _mem.get(cacheKey);
  if (e) {
    for (const t of e.tags) _byTag.get(t)?.delete(cacheKey);
    _mem.delete(cacheKey);
  }
  const redis = await getRedis().catch(() => null);
  if (redis) {
    redis.del(cacheKey).catch(() => {});
  }
}

/**
 * Drop every entry that registered `tag`. Idempotent — safe to call from
 * write paths even when nothing is cached.
 */
export async function invalidateByTag(tag: string): Promise<void> {
  const memKeys = _byTag.get(tag);
  if (memKeys) {
    for (const k of memKeys) _mem.delete(k);
    _byTag.delete(tag);
  }
  const redis = await getRedis().catch(() => null);
  if (redis) {
    try {
      const keys = await redis.smembers(`tag:${tag}`);
      if (keys.length) {
        const pipe = redis.pipeline();
        for (const k of keys) pipe.del(k);
        pipe.del(`tag:${tag}`);
        await pipe.exec();
      }
    } catch (e) {
      logger.warn('[Cache] tag invalidation failed', { tag, error: String(e) });
    }
  }
  logger.info('[Cache] invalidated tag', { tag, memKeys: memKeys?.size ?? 0 });
}

/** Test-only: wipe all in-memory state. Does NOT touch Redis. */
export function _resetCacheForTest(): void {
  _mem.clear();
  _byTag.clear();
}
