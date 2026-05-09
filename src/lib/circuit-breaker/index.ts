// src/lib/circuit-breaker/index.ts — HemaV066
// LOW-05 FIX (V062): Circuit breaker state persisted to Redis for multi-instance coordination.
//   On Vercel multi-instance deployments each pod had an independent in-memory breaker —
//   instance A could open its circuit while B continued sending requests to the failing service.
//   Fix: Redis keys `circuit:<name>:state` and `circuit:<name>:failures` sync state across pods.
//   Graceful fallback to in-memory if Redis is unavailable — non-critical path.
//
// States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery)

import { logger }         from '@/lib/logger';
import { alertCircuitOpen } from '@/lib/alerts';
import { getRedis }       from '@/lib/redis';

type CBState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CBConfig {
  name:               string;
  failureThreshold:   number;
  successThreshold:   number;
  timeout:            number;  // ms before OPEN → HALF_OPEN
  volumeThreshold:    number;
}

interface CBStats {
  failures:    number;
  successes:   number;
  calls:       number;
  state:       CBState;
  lastFailure: number;
  nextAttempt: number;
}

const DEFAULT_CONFIG: Omit<CBConfig, 'name'> = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout:          30_000,
  volumeThreshold:  5,
};

// In-memory registry — authoritative when Redis unavailable.
const breakers = new Map<string, CBStats>();

function getStats(name: string): CBStats {
  if (!breakers.has(name)) {
    breakers.set(name, {
      failures: 0, successes: 0, calls: 0,
      state: 'CLOSED', lastFailure: 0, nextAttempt: 0,
    });
  }
  return breakers.get(name)!;
}

// ── LOW-05 FIX: Redis persistence helpers ────────────────────────────────────

/** Read circuit state from Redis. Returns null on error (graceful degradation). */
async function readRedisState(name: string): Promise<{ state: CBState; failures: number; nextAttempt: number } | null> {
  try {
    const redis = await getRedis().catch(() => null);
    if (!redis) return null;
    const [stateRaw, failuresRaw, nextAttemptRaw] = await Promise.all([
      redis.get(`circuit:${name}:state`),
      redis.get(`circuit:${name}:failures`),
      redis.get(`circuit:${name}:nextAttempt`),
    ]);
    if (!stateRaw) return null;
    const state = stateRaw as CBState;
    const failures    = parseInt(failuresRaw ?? '0', 10) || 0;
    const nextAttempt = parseInt(nextAttemptRaw ?? '0', 10) || 0;
    return { state, failures, nextAttempt };
  } catch {
    return null; // non-critical — fall back to in-memory
  }
}

/** Write circuit state to Redis with TTL. Fire-and-forget on error. */
async function writeRedisState(
  name: string,
  state: CBState,
  failures: number,
  nextAttempt: number,
  timeoutMs: number,
): Promise<void> {
  try {
    const redis = await getRedis().catch(() => null);
    if (!redis) return;
    const ttlSec = Math.max(60, Math.ceil(timeoutMs / 1000) * 2); // 2× timeout for safety
    await Promise.all([
      redis.setex(`circuit:${name}:state`,       ttlSec, state),
      redis.setex(`circuit:${name}:failures`,    ttlSec, String(failures)),
      redis.setex(`circuit:${name}:nextAttempt`, ttlSec, String(nextAttempt)),
    ]);
  } catch (e) {
    logger.warn('[CircuitBreaker] Redis write failed — state in-memory only', { name, error: String(e) });
  }
}

export class CircuitOpenError extends Error {
  constructor(service: string) {
    super(`Circuit breaker OPEN for "${service}" — service unavailable`);
    this.name = 'CircuitOpenError';
  }
}

export async function withCircuitBreaker<T>(
  name:    string,
  fn:      () => Promise<T>,
  config?: Partial<CBConfig>,
): Promise<T> {
  const cfg   = { ...DEFAULT_CONFIG, name, ...config };
  const stats = getStats(name);
  const now   = Date.now();

  // LOW-05 FIX: Check Redis state first — sync local stats with cross-instance state.
  const redisState = await readRedisState(name);
  if (redisState) {
    // Merge Redis state into local: Redis is authoritative on state and failures.
    if (redisState.state !== stats.state) {
      logger.info('[CircuitBreaker] Syncing state from Redis', {
        service: name, local: stats.state, redis: redisState.state,
      });
    }
    stats.state       = redisState.state;
    stats.failures    = Math.max(stats.failures, redisState.failures); // take the higher count
    stats.nextAttempt = Math.max(stats.nextAttempt, redisState.nextAttempt);
  }

  // Capture state BEFORE the OPEN check. TypeScript control-flow narrows stats.state
  // to 'CLOSED'|'HALF_OPEN' after the if-block below, so any variable assigned from
  // stats.state after that point would also be narrowed — making a later comparison to
  // 'OPEN' an impossible overlap error. Wrapping in an IIFE returning CBState forces
  // tsc to treat the value as the full union without triggering narrowing.
  const stateBeforeCall = ((): CBState => stats.state)();

  // OPEN → maybe transition to HALF_OPEN
  if (stats.state === 'OPEN') {
    if (now < stats.nextAttempt) {
      throw new CircuitOpenError(name);
    }
    stats.state     = 'HALF_OPEN';
    stats.failures  = 0;
    stats.successes = 0;
    logger.warn('[CircuitBreaker] HALF_OPEN', { service: name });
    void writeRedisState(name, 'HALF_OPEN', 0, 0, cfg.timeout);
  }

  stats.calls++;

  try {
    const result = await fn();

    if (stats.state === 'HALF_OPEN') {
      stats.successes++;
      if (stats.successes >= cfg.successThreshold) {
        stats.state    = 'CLOSED';
        stats.failures = 0;
        logger.info('[CircuitBreaker] CLOSED (recovered)', { service: name });
        void writeRedisState(name, 'CLOSED', 0, 0, cfg.timeout);
      }
    } else {
      stats.failures = 0;
    }

    return result;
  } catch (error) {
    stats.failures++;
    stats.lastFailure = now;

    if (
      stats.state === 'HALF_OPEN' ||
      (stats.calls >= cfg.volumeThreshold && stats.failures >= cfg.failureThreshold)
    ) {
      const wasAlreadyOpen = stateBeforeCall === 'OPEN';
      const priorState     = stats.state;
      stats.state          = 'OPEN';
      stats.nextAttempt    = now + cfg.timeout;
      logger.error('[CircuitBreaker] OPEN', {
        service: name, failures: stats.failures, priorState,
        nextAttempt: new Date(stats.nextAttempt).toISOString(),
      });
      // LOW-05 FIX: Persist OPEN state to Redis so all instances see the open circuit.
      void writeRedisState(name, 'OPEN', stats.failures, stats.nextAttempt, cfg.timeout);
      if (!wasAlreadyOpen) {
        alertCircuitOpen(name);
      }
    }

    throw error;
  }
}

export function getCircuitStatus(): Record<string, CBStats> {
  return Object.fromEntries(breakers.entries());
}
