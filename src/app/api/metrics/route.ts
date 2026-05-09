// src/app/api/metrics/route.ts — HemaV066
// LOW-01 ADVISORY (V066): This endpoint is protected only by METRICS_SECRET bearer token.
//   For defense-in-depth, restrict to internal network CIDRs or use Vercel's
//   private endpoints feature. Operator action required — not a code change.
// HemaV050: FIX #3 — timing-safe METRICS_SECRET comparison
// V027: Prometheus-compatible metrics
import { NextRequest, NextResponse } from 'next/server';
import crypto                        from 'crypto';
import { getCircuitStatus }          from '@/lib/circuit-breaker';
import { getIP }                     from '@/lib/api';

export const dynamic = 'force-dynamic';

// FIX #3 (V031): Use timing-safe comparison to prevent secret oracle attacks.
// A simple `bearer === \`Bearer ${secret}\`` leaks timing info that reveals
// secret characters byte-by-byte under repeated measurement.
// V057 FIX: Added explicit length equality check BEFORE the padded buffer comparison.
// Without this, strings longer than 512 bytes are silently truncated by Buffer.write(),
// which could allow a crafted 512-byte token that shares a prefix with the real secret
// to pass the comparison. Length check closes this theoretical truncation attack vector.
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false; // V057: explicit length guard
  const bufA = Buffer.alloc(512);
  const bufB = Buffer.alloc(512);
  bufA.write(a, 0, 'utf8');
  bufB.write(b, 0, 'utf8');
  return crypto.timingSafeEqual(bufA, bufB);
}

// V016 FIX: In production, METRICS_SECRET is always required — localhost IP bypass
// is exploitable in cloud environments (Kubernetes, ECS) where all pods share an
// internal network and can appear as 127.0.0.1 to each other.
// In development, localhost without a secret is still permitted for convenience.
function isAuthorized(req: NextRequest): boolean {
  const ip     = getIP(req);
  const bearer = req.headers.get('authorization');
  const secret = process.env.METRICS_SECRET;

  // Production: ALWAYS require bearer token — no IP bypass
  if (process.env.NODE_ENV === 'production') {
    if (!secret || !bearer) return false;
    return timingSafeCompare(bearer, `Bearer ${secret}`);
  }

  // Development: localhost without secret is fine (convenience)
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (secret && bearer && timingSafeCompare(bearer, `Bearer ${secret}`)) return true;
  return false;
}

function gauge(name: string, value: number, labels = ''): string {
  return `${name}${labels ? `{${labels}}` : ''} ${value}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const circuits = getCircuitStatus();
  const mem      = process.memoryUsage();
  const lines: string[] = [
    '# HELP ehema_circuit_breaker_state Circuit breaker state (0=CLOSED,1=HALF_OPEN,2=OPEN)',
    '# TYPE ehema_circuit_breaker_state gauge',
    ...Object.entries(circuits).map(([n, s]) =>
      gauge('ehema_circuit_breaker_state', s.state === 'CLOSED' ? 0 : s.state === 'HALF_OPEN' ? 1 : 2, `service="${n}"`)
    ),
    '# HELP ehema_circuit_breaker_failures Circuit breaker failure count',
    '# TYPE ehema_circuit_breaker_failures counter',
    ...Object.entries(circuits).map(([n, s]) =>
      gauge('ehema_circuit_breaker_failures', s.failures, `service="${n}"`)
    ),
    '# HELP process_uptime_seconds Uptime in seconds',
    '# TYPE process_uptime_seconds gauge',
    gauge('process_uptime_seconds', Math.round(process.uptime())),
    '# HELP process_memory_heap_bytes Heap used bytes',
    '# TYPE process_memory_heap_bytes gauge',
    gauge('process_memory_heap_bytes', mem.heapUsed),
    '# HELP process_memory_rss_bytes RSS bytes',
    '# TYPE process_memory_rss_bytes gauge',
    gauge('process_memory_rss_bytes', mem.rss),
  ];
  return new NextResponse(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; version=0.0.4', 'Cache-Control': 'no-store' },
  });
}
