// src/app/api/healthz/route.ts — HemaV069
// CRIT-002 FIX (V069): Removed IP loopback bypass from isPrivilegedHealthCaller().
//   In Kubernetes/ECS/Docker environments, any Pod in the internal network can spoof
//   X-Forwarded-For: 127.0.0.1 to obtain verbose infrastructure data without a secret.
//   METRICS_SECRET is now required unconditionally for verbose health data.
//   This aligns healthz with the same trust boundary as /api/metrics.
// V056 FIX: use canonical getClientIp() and static ESM import for timingSafeEqual.
// BUG (V028): original isPrivilegedHealthCaller read x-forwarded-for directly.
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual }  from 'crypto';
import { getCircuitStatus } from '@/lib/circuit-breaker';
import mongoose from 'mongoose';
import pkg from '../../../../package.json';

interface HealthStatus {
  status:      'healthy' | 'degraded' | 'unhealthy';
  version?:    string;
  timestamp:   string;
  uptime?:     number;
  environment: string;
  checks: {
    mongodb:   { status: string; latencyMs?: number };
    redis:     { status: string; latencyMs?: number };
    circuits:  Record<string, unknown>;
  };
}

// CRIT-002 FIX (V069): IP loopback bypass removed entirely.
// The only way to obtain verbose health data is via METRICS_SECRET bearer token.
// This prevents any Pod/container from spoofing localhost to extract infra topology.
function isPrivilegedHealthCaller(req: NextRequest | undefined): boolean {
  if (!req) return false;
  const auth   = req.headers.get('authorization');
  const secret = process.env.METRICS_SECRET;
  if (!secret || !auth) return false;
  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(auth,     'utf8'),
      Buffer.from(expected, 'utf8'),
    );
  } catch { return false; }
}

export async function GET(req: NextRequest): Promise<NextResponse<HealthStatus>> {
  const isProd  = process.env.NODE_ENV === 'production';
  const verbose = isPrivilegedHealthCaller(req);
  const checks: HealthStatus['checks'] = {
    mongodb:  { status: 'unchecked' },
    redis:    { status: 'unchecked' },
    // In production, redact circuit-breaker internals — they can leak service topology
    circuits: isProd ? {} : getCircuitStatus(),
  };

  // MongoDB check
  const mongoStart = Date.now();
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db?.admin().ping();
      checks.mongodb = { status: 'healthy', latencyMs: Date.now() - mongoStart };
    } else {
      checks.mongodb = { status: 'disconnected' };
    }
  } catch {
    checks.mongodb = { status: 'unhealthy', latencyMs: Date.now() - mongoStart };
  }

  // Redis check
  const redisStart = Date.now();
  try {
    const { getRedis } = await import('@/lib/redis');
    const redis = await getRedis();
    if (redis && redis.status === 'ready') {
      await redis.ping();
      checks.redis = { status: 'healthy', latencyMs: Date.now() - redisStart };
    } else {
      checks.redis = { status: process.env.REDIS_URL ? 'disconnected' : 'not_configured' };
    }
  } catch {
    checks.redis = { status: 'unhealthy', latencyMs: Date.now() - redisStart };
  }

  const hasUnhealthy = checks.mongodb.status === 'unhealthy';
  const hasDegraded  = checks.mongodb.status === 'disconnected' || checks.redis.status === 'unhealthy';
  // In prod, circuit status is redacted so openCircuits is always 0 — expected
  const openCircuits = Object.values(checks.circuits)
    .filter((c: unknown) => (c as { state: string }).state === 'OPEN').length;

  const status = hasUnhealthy
    ? 'unhealthy'
    : hasDegraded || openCircuits > 0
      ? 'degraded'
      : 'healthy';

  const body: HealthStatus = {
    status,
    // V011: P1-06 — only emit version + uptime to privileged callers.
    ...(verbose ? { version: pkg.version, uptime: Math.round(process.uptime()) } : {}),
    timestamp:   new Date().toISOString(),
    environment: process.env.NODE_ENV ?? 'unknown',
    checks,
  };

  return NextResponse.json(body, {
    status:  status === 'unhealthy' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
