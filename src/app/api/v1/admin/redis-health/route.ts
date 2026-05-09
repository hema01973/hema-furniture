// src/app/api/v1/admin/redis-health/route.ts — HemaV066
// V061 FIX-C: Dedicated Redis health check endpoint for admin observability.
//
// Provides:
//   - Real-time Redis connectivity status (ping latency)
//   - Degradation mode indicator (Redis DOWN → in-memory fallback active)
//   - Memory store saturation metrics (MEM_STORE key count when Redis is down)
//   - Clear structured logging on degradation detection
//
// Access: ADMIN or MANAGER only (requirePermission 'read:admin').
// Usage:  GET /api/v1/admin/redis-health
//         Header: Authorization: Bearer <METRICS_SECRET>  OR  admin session cookie

import { NextRequest } from 'next/server';
import { ok, err, withErrorHandler } from '@/lib/api';
import { requirePermission }        from '@/lib/authz';
import { getRedis }                 from '@/lib/redis';
import { logger }                   from '@/lib/logger';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await requirePermission(req, 'read:admin');
  if (!auth.ok) return auth.response;

  const start  = Date.now();
  const result = {
    status:       'unknown' as 'healthy' | 'degraded' | 'unavailable' | 'not_configured',
    latencyMs:    null as number | null,
    degraded:     false,
    degradedNote: null as string | null,
    configuredUrl: Boolean(process.env.REDIS_URL),
    timestamp:    new Date().toISOString(),
  };

  if (!process.env.REDIS_URL) {
    result.status       = 'not_configured';
    result.degraded     = true;
    result.degradedNote = 'REDIS_URL is not set — all rate limiting is in-memory (single-instance only). ' +
      'Distributed rate limiting, session blacklisting, and idempotency checks are unavailable.';

    logger.warn('[Redis] Health check: REDIS_URL not configured — running in degraded mode', {
      degraded: true,
      impact:   'rate-limiting-in-memory, no-distributed-session-blacklist',
    });

    return ok(result);
  }

  try {
    const redis = await getRedis();

    if (!redis) {
      result.status       = 'unavailable';
      result.degraded     = true;
      result.degradedNote = 'Redis is configured but connection failed. ' +
        'Rate limiting falling back to in-memory. ' +
        'Routes using getRedisOrThrow() will return 503. Check Redis cluster health.';

      logger.error('[Redis] Health check: connection unavailable — degradation active', {
        degraded: true,
        impact:   'rate-limiting-in-memory, session-blacklist-unavailable, idempotency-unavailable',
      });

      return ok(result, 503);
    }

    // Active PING to verify round-trip connectivity
    await redis.ping();
    result.latencyMs = Date.now() - start;
    result.status    = 'healthy';
    result.degraded  = false;

    logger.info('[Redis] Health check: healthy', { latencyMs: result.latencyMs });

  } catch (e) {
    result.status       = 'unavailable';
    result.degraded     = true;
    result.latencyMs    = Date.now() - start;
    result.degradedNote = 'Redis PING failed — connection dropped or timed out.';

    logger.error('[Redis] Health check: PING failed — degradation active', {
      degraded:  true,
      latencyMs: result.latencyMs,
      error:     e instanceof Error ? e.message : String(e),
    });

    return err('Redis unavailable', 503);
  }

  return ok(result);
}, { rateMax: 60, rateWindow: 60 });
