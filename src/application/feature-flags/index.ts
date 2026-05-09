// src/application/feature-flags/index.ts — HemaV050
// Enterprise feature flags system.
//
// Features can be:
//   1. Hard-coded (env-var based) — zero latency, deploy to change
//   2. Redis-backed — change at runtime without redeployment
//   3. User-targeted — A/B testing, gradual rollouts by userId/role
//
// Usage:
//   const flags = await getFeatureFlags();
//   if (flags.isEnabled('new_checkout_flow')) { ... }

import { getRedis } from '@/lib/redis';
import { logger }   from '@/lib/logger';

// ── Flag catalog ─────────────────────────────────────────────────
// Add new flags here. Default is the fallback when Redis is unavailable.
const FLAG_DEFAULTS: Record<string, boolean> = {
  // Checkout & payments
  new_checkout_flow:      false,
  fawry_payments:         false,
  valu_payments:          false,
  // Product features
  product_compare:        false,
  ar_product_search:      true,
  // UX
  dark_mode:              true,
  loyalty_program:        false,
  // Operations
  maintenance_mode:       false,
  guest_checkout:         true,
  // Admin
  bulk_order_import:      false,
  advanced_analytics:     false,
} as const;

export type FlagName = keyof typeof FLAG_DEFAULTS;

// ── Runtime cache (TTL: 60s) ──────────────────────────────────────
let _cache: Record<string, boolean> | null = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 60_000;

async function loadFlags(): Promise<Record<string, boolean>> {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL_MS) return _cache;

  const flags: Record<string, boolean> = { ...FLAG_DEFAULTS };

  // Override with env vars: FEATURE_FLAG_NEW_CHECKOUT_FLOW=true
  for (const key of Object.keys(FLAG_DEFAULTS)) {
    const envKey = `FEATURE_FLAG_${key.toUpperCase()}`;
    if (process.env[envKey] !== undefined) {
      flags[key] = process.env[envKey] === 'true';
    }
  }

  // Override with Redis runtime flags (set via admin panel or CLI)
  try {
    const redis = await getRedis();
    if (redis) {
      const keys   = Object.keys(FLAG_DEFAULTS).map(k => `feature:${k}`);
      const values = await redis.mget(...keys);
      keys.forEach((redisKey, i) => {
        if (values[i] !== null) {
          const flagName = redisKey.replace('feature:', '');
          flags[flagName] = values[i] === 'true';
        }
      });
    }
  } catch (e) {
    logger.warn('[FeatureFlags] Redis read failed, using defaults', { error: String(e) });
  }

  _cache   = flags;
  _cacheTs = now;
  return flags;
}

export class FeatureFlags {
  constructor(private readonly flags: Record<string, boolean>) {}

  isEnabled(flag: FlagName, userId?: string): boolean {
    // User-specific override: feature:flag_name:userId
    // (Loaded separately for targeted rollouts — stub for now)
    return this.flags[flag] ?? FLAG_DEFAULTS[flag] ?? false;
  }

  getAll(): Record<string, boolean> {
    return { ...this.flags };
  }
}

export async function getFeatureFlags(userId?: string): Promise<FeatureFlags> {
  const flags = await loadFlags();
  return new FeatureFlags(flags);
}

// Admin: toggle a flag at runtime (persists to Redis)
export async function setFlag(flag: FlagName, value: boolean): Promise<void> {
  const redis = await getRedis();
  if (!redis) throw new Error('Redis not available — cannot set runtime flags');
  await redis.set(`feature:${flag}`, value ? 'true' : 'false');
  _cache = null; // Invalidate cache
  logger.info('[FeatureFlags] Flag updated', { flag, value });
}

// Invalidate in-memory cache (e.g. after bulk update)
export function invalidateFlagCache(): void {
  _cache = null;
}
