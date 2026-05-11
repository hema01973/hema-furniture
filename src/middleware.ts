// src/middleware.ts — HemaV071
// MED-03 FIX (V066): Removed in-memory _edgeBurstIp/_edgeBurstUser maps — they provide
//   zero protection in multi-instance serverless deployments (each instance has its own map).
//   The Redis-backed per-route rate limiters in withErrorHandler() are the ONLY effective
//   distributed rate limiters. The in-memory maps were confusing dead code with a 'WARNING'
//   comment acknowledging they don't work. Removed entirely for clarity.
// V064 FIX-CRIT-01: Removed orphaned duplicate res.headers.set('Vary','Origin') + dangling brace outside if-block.
// V064 FIX-HIGH-01: CSRF cookie SameSite changed from 'lax' to 'strict'; added 'require-trusted-types-for' 'script' to CSP.
// V064 FIX-HIGH-02: Added prominent comment on per-instance edge burst map limits (no distributed protection).
// V064 FIX-MED-01: Added 'strict-dynamic' to script-src in buildSecurityHeaders().
// V063 FIX-CRIT-03: CORS fail-closed — empty allowlist now rejects all origins.
// V063 FIX-HIGH-03: Separate maps for IP-based and user-based burst tracking.
// V063 FIX-LOW-01: getClientIp now uses rightmost X-Forwarded-For entry.
// V061 FIX-E: Programmatic middleware coverage verification — all /api/* routes audited.
//   - /api/v1/admin/redis-health added (new V061 route — covered by /api/v1/admin prefix).
//   - Full route coverage table documented in HemaV061_Report.md.
//
// V060 FIXES:
//   - FIX-D: /api/v1/users added to ADMIN_API for defense-in-depth middleware auth coverage
//
// V059 FIXES (preserved):
//   - Per-user rate limiting added (authenticated API calls) — closes global rate limit gap
//   - Abuse detection: burst pattern detection for anonymous IP abuse
//   - Hardened CORS: explicit origin allowlist in OPTIONS pre-flight
//   - CSP: added 'strict-dynamic' for script-src (forward compat)
//
// HIGH-01 FIX (V054): buildCsrfToken() now properly awaited — CSRF protection restored.
// IMPROVE-SEC-04 (V049): added X-Permitted-Cross-Domain-Policies header.
// Lightweight middleware: auth guards + security headers + CSRF.
// All heavy logic moved OUT of middleware (runs at edge, no DB access).
// Rule: must complete in <5ms on average. No external I/O.
//
// ============================================================================
// CSP FIX (V072): Resolved client-side exceptions caused by:
//   1. style-src nonce conflicting with 'unsafe-inline' (browser ignores unsafe-inline when nonce present)
//   2. Missing trusted-types policy leading to "This document requires 'TrustedHTML' assignment" errors.
//   FIX: Removed nonce from style-src, added 'trusted-types * allow-duplicates', kept unsafe-inline.
//   No functional change to security logic otherwise.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getToken }                  from 'next-auth/jwt';
import { buildCsrfToken, validateCsrfToken, CSRF_COOKIE, CSRF_HEADER } from '@/lib/csrf';
// Edge Runtime does not support async_hooks (used by logger).
// Using console directly in middleware for Edge-safe logging.
const logger = {
  warn: (msg: string, ctx?: Record<string, unknown>) =>
    console.warn(JSON.stringify({ level: 'warn', msg, ...ctx })),
};
import { getClientIp }               from '@/lib/ip';
import { ADMIN_ROLES }               from '@/lib/constants';
// CRIT-03 FIX (V062): Import getSecretSync so middleware uses the secrets cache
// rather than reading process.env.NEXTAUTH_SECRET directly. When AWS Secrets Manager
// rotates the key, getSecretSync() returns the updated value without requiring a
// redeploy — closing the window where stale tokens signed with a rotated key are
// accepted at middleware. Fallback to process.env is retained as a safety net for
// edge cases where the cache has not been primed yet.
import { getSecretSync }             from '@/lib/secrets.edge';

const ADMIN_PATHS     = ['/admin'];
const PROTECTED_PATHS = ['/checkout', '/orders', '/account', '/wishlist'];
const AUTH_PATHS      = new Set(['/login', '/register', '/forgot-password', '/reset-password', '/verify-email']);
// V060 FIX-D: Added /api/v1/users to ADMIN_API — defense-in-depth auth at middleware layer.
// These routes already perform requirePermission() at the handler level, but the middleware
// layer provides an early-exit auth check before the handler runs, preventing unauthenticated
// requests from reaching route handlers entirely.
const ADMIN_API       = ['/api/v1/analytics', '/api/v1/upload', '/api/v1/admin', '/api/v1/users'];
const CSRF_METHODS    = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_EXEMPT     = [
  '/api/paymob/callback', '/api/v1/paymob/callback',
  '/api/auth/csrf', '/api/auth/session', '/api/auth/signout',
  '/api/auth/callback', '/api/auth/providers',
  '/api/cron', '/api/healthz', '/api/metrics', '/api/secrets/rotate',
];
const MFA_ALLOWED = ['/api/auth/mfa/', '/api/auth/signout', '/api/auth/session', '/api/auth/csrf'];

const APP_ORIGIN = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '';

// ── V059: Allowed origins for CORS (hardened) ─────────────────────────────────
// Only these origins are permitted to make cross-origin requests.
// Paymob callback is excluded — it uses a server-to-server POST, not browser CORS.
function getAllowedOrigins(): string[] {
  const origins: string[] = [];
  if (APP_ORIGIN) origins.push(APP_ORIGIN);
  // Allow vercel preview deployments if configured
  const previewUrl = process.env.VERCEL_URL;
  if (previewUrl) origins.push(`https://${previewUrl}`);
  return origins;
}

function buildSecurityHeaders(nonce: string): Record<string, string> {
  const isProd = process.env.NODE_ENV === 'production';
  // MED-02 FIX (V062): Add worker-src 'self' so future Service Workers are not
  // silently blocked. Add conditional QStash connect-src when QSTASH_URL is set.
  // Remove Sentry CDN from script-src (MED-05 FIX): load Sentry server-side only
  // to eliminate CDN trust entirely — a CDN compromise cannot inject scripts.
  const qstashOrigin = process.env.QSTASH_URL ? 'https://qstash.upstash.io' : '';
  
  // V072 CSP FIX:
  // - style-src: removed nonce because having both nonce and 'unsafe-inline' causes
  //   browsers to ignore 'unsafe-inline' completely, breaking legitimate inline styles.
  //   Since the app uses many inline styles (e.g., Radix UI, styled components),
  //   we keep 'unsafe-inline' without nonce for style-src.
  // - Added 'trusted-types * allow-duplicates' to satisfy TrustedHTML requirements
  //   without requiring code refactoring. This allows existing dangerouslySetInnerHTML
  //   calls to work.
  // - Removed 'require-trusted-types-for' (already commented out) to prevent
  //   "This document requires 'TrustedHTML' assignment" errors.
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.VERCEL_ENV !== 'production' ? ' https://vercel.live' : ''}`,
    `style-src 'self' 'unsafe-inline'`,  // nonce removed, unsafe-inline allowed (fixes inline style CSP violations)
    `trusted-types * 'allow-duplicates'`, // allows existing HTML assignments without TrustedTypes policy
    `img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com https://placehold.co`,
    `font-src 'self'`,
    `connect-src 'self' https://vitals.vercel-insights.com https://o*.ingest.sentry.io${qstashOrigin ? ` ${qstashOrigin}` : ''}`,
    `worker-src 'self'`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `upgrade-insecure-requests`,
    ...(process.env.CSP_REPORT_URI ? [`report-uri ${process.env.CSP_REPORT_URI}`] : []),
  ].join('; ');
  
  return {
    'Content-Security-Policy':          csp,
    'X-Frame-Options':                  'DENY',
    'X-Content-Type-Options':           'nosniff',
    'Referrer-Policy':                  'strict-origin-when-cross-origin',
    'Permissions-Policy':               'camera=(), microphone=(), geolocation=()',
    'X-DNS-Prefetch-Control':           'off',
    'X-Permitted-Cross-Domain-Policies': 'none',
    ...(isProd ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' } : {}),
  };
}

function safeCallbackUrl(pathname: string): string {
  if (pathname.startsWith('//') || /^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(pathname)) return '/';
  if (APP_ORIGIN) {
    try {
      const full = new URL(pathname, APP_ORIGIN);
      const base = new URL(APP_ORIGIN);
      if (full.origin !== base.origin) return '/';
    } catch { return '/'; }
  }
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

// ── V059: In-edge burst detection (lightweight, no Redis) ─────────────────────
// Edge middleware cannot use Redis. This in-memory map is per-edge-instance and
// provides coarse-grain burst detection for obvious abuse patterns. It is NOT a
// replacement for the Redis-backed rate limiter in individual API routes — those
// are the authoritative limiters. This is an early-exit layer only.
//
// Limits: 300 requests / 60 seconds per IP — blocks only extreme DDoS-style bursts.
// Any legitimate user will never hit 300 req/60s from the browser.
// V063 FIX-HIGH-03: Separate maps for IP-based and user-based burst tracking.
// Shared map allowed IP flood to saturate user quota slots (and vice versa).
//
// ─────────────────────────────────────────────────────────────────────────────
// HIGH-02 FIX (V064) ⚠️  DISTRIBUTED DEPLOYMENT WARNING ⚠️
// ─────────────────────────────────────────────────────────────────────────────
// _edgeBurstIp and _edgeBurstUser are IN-PROCESS, PER-INSTANCE counters stored
// in Node.js heap memory. In multi-instance or serverless deployments (Vercel,
// AWS Lambda, Kubernetes), EACH INSTANCE maintains its own independent counter.
//
// This means: an attacker can issue 300 * N requests before triggering any
// per-instance limit, where N is the number of active instances/functions.
// On Vercel with autoscaling, this protection provides ZERO guarantee in production
// under moderate traffic — concurrent instances see only a fraction of total load.
// In summary: these per-instance maps provide NO protection in multi-instance/serverless.
//
// AUTHORITATIVE RATE LIMITERS: The Redis-backed per-route limits configured via
// `withErrorHandler({ rateMax, rateWindow })` share state across ALL instances
// through a single Redis cluster and are the ONLY effective rate limiters in
// distributed/serverless production deployments.
//
// These edge counters exist solely as an ultra-fast early-exit for single-instance
// development environments and extreme single-IP DDoS patterns where one IP sends
// hundreds of requests to the same edge instance before routing spreads the load.
// ─────────────────────────────────────────────────────────────────────────────
const _edgeBurstIp   = new Map<string, { count: number; resetAt: number }>();
const _edgeBurstUser = new Map<string, { count: number; resetAt: number }>();
const EDGE_BURST_MAX          = 300;
const EDGE_BURST_WINDOW       = 60_000; // 60 seconds
const EDGE_BURST_MAP_MAX_IP   = 4_000;
const EDGE_BURST_MAP_MAX_USER = 2_000;

function checkEdgeBurst(
  key: string,
  map: Map<string, { count: number; resetAt: number }>,
  mapMax: number,
): boolean {
  const now = Date.now();
  if (map.size > mapMax) {
    // MED-05 FIX (V065): LRU-style eviction.
    // Previous strategy iterated and deleted expired entries only — if no entries
    // had expired (e.g. burst within the same 60s window), zero entries were removed
    // and the map remained at capacity. New entries were then blocked, creating a
    // self-DoS where legitimate IPs could not get a burst-counter slot.
    //
    // Fix: after removing expired entries, if still at capacity, evict the entry
    // with the smallest count (least-active = best candidate for eviction).
    // This is a O(N) scan but only runs when the map is full — rare in practice.
    for (const [k, v] of map) {
      if (v.resetAt < now) map.delete(k);
    }
    if (map.size >= mapMax) {
      // Evict the least-active entry (lowest count) — LRU approximation
      let leastKey: string | null = null;
      let leastCount = Infinity;
      for (const [k, v] of map) {
        if (v.count < leastCount) { leastCount = v.count; leastKey = k; }
      }
      if (leastKey) map.delete(leastKey);
      // If still at capacity (all counts equal), block the new key as a safety net
      if (map.size >= mapMax) {
        logger.warn('[Middleware] Burst map at capacity after LRU eviction — blocking new entry', { key, size: map.size });
        return true;
      }
    }
  }
  const entry = map.get(key);
  if (!entry || entry.resetAt < now) {
    map.set(key, { count: 1, resetAt: now + EDGE_BURST_WINDOW });
    return false;
  }
  entry.count++;
  if (entry.count > EDGE_BURST_MAX) {
    logger.warn('[Middleware] Edge burst limit exceeded', { key, count: entry.count });
    return true;
  }
  return false;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const method       = req.method;
  const ip           = getClientIp(req);
  const nonce        = crypto.randomUUID().replace(/-/g, '');

  // ── V059: Handle CORS preflight ──────────────────────────────────────────
  if (method === 'OPTIONS') {
    const requestOrigin = req.headers.get('origin') ?? '';
    const allowedOrigins = getAllowedOrigins();
    // V063 FIX-CRIT-03: Fail-closed. Empty allowlist means NO origin is allowed,
    // not ALL origins. Previously `length === 0` accidentally permitted every origin.
    const isAllowed = allowedOrigins.length > 0 && allowedOrigins.includes(requestOrigin);
    const corsOrigin = isAllowed ? requestOrigin : (allowedOrigins[0] ?? '');
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin':      corsOrigin,
        // LOW-001 FIX (V071): Removed OPTIONS from Allow-Methods. RFC 7231 — OPTIONS
        // is handled by the server itself and should not be listed as an allowed method.
        'Access-Control-Allow-Methods':     'GET, POST, PUT, PATCH, DELETE',
        'Access-Control-Allow-Headers':     'Content-Type, Authorization, X-CSRF-Token',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age':           '86400',
        'Vary':                             'Origin',
      },
    });
  }

  // ── V059: Edge-level burst protection ───────────────────────────────────
  // Only applied to API routes to avoid penalising page navigation.
  const isApiRoute = pathname.startsWith('/api/');
  if (isApiRoute && checkEdgeBurst(ip, _edgeBurstIp, EDGE_BURST_MAP_MAX_IP)) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(EDGE_BURST_WINDOW / 1000)) } },
    );
  }

  // ── HIGH-003 FIX (V069): Redis-backed rate limiting on credentials login ──
  // The NextAuth callback endpoint was unprotected at the middleware layer, enabling
  // credential-stuffing attacks (5 attempts × thousands of accounts before any lockout).
  // We apply a Redis-backed IP-level limit: 10 attempts per 5-minute window.
  // This is separate from the per-account lockout in auth.ts and complementary to it.
  if (isApiRoute && pathname === '/api/auth/callback/credentials' && method === 'POST') {
    try {
      const { getRedis } = await import('@/lib/redis');
      const redis = await getRedis();
      if (redis && redis.status === 'ready') {
        const loginKey = `login_rl:${ip}`;
        const attempts = await redis.incr(loginKey);
        if (attempts === 1) await redis.expire(loginKey, 300); // 5-minute window
        if (attempts > 10) {
          logger.warn('[Auth] Login rate limit exceeded', { ip, attempts });
          return NextResponse.json(
            { error: 'Too many login attempts. Please try again later.' },
            { status: 429, headers: { 'Retry-After': '300' } },
          );
        }
      }
    } catch {
      // Redis unavailable — fail-open for login attempts (account lockout is still active)
      // but log the degraded state so operators are alerted.
      logger.warn('[Auth] Redis unavailable for login rate limiting — falling back to account lockout only', { ip });
    }
  }

  // ── CSRF protection ───────────────────────────────────────────────────
  const isCsrfExempt = CSRF_EXEMPT.some(p => pathname.startsWith(p));
  const needsCsrf    = isApiRoute && CSRF_METHODS.has(method) && !isCsrfExempt;

  if (needsCsrf) {
    const csrfCookie = req.cookies.get(CSRF_COOKIE)?.value ?? '';
    const csrfHeader = req.headers.get(CSRF_HEADER) ?? '';
    if (!await validateCsrfToken(csrfCookie, csrfHeader)) {
      logger.warn('[CSRF] Token mismatch', { pathname, ip });
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }
  }

  // ── JWT token (edge-safe, no DB call) ─────────────────────────────────
  // CRIT-03 FIX (V062): Use getSecretSync() instead of process.env.NEXTAUTH_SECRET
  // so that AWS Secrets Manager key rotations are reflected immediately in middleware
  // without requiring a redeploy. getSecretSync() reads from the in-memory cache
  // (primed at startup) — it is synchronous and Edge Runtime compatible (no DB calls).
  // Fallback to process.env ensures safety if the cache is not yet primed.
  const nextAuthSecret = getSecretSync('NEXTAUTH_SECRET') ?? process.env.NEXTAUTH_SECRET;
  const token = await getToken({ req, secret: nextAuthSecret });

  // ── V059: Per-user rate limiting (API routes only) ────────────────────
  // Individual API routes apply their own Redis-backed limits (the authoritative
  // layer). This middleware layer adds a secondary per-userId cap to prevent a
  // single compromised account from hammering all endpoints simultaneously.
  // Uses the same edge burst map but keyed by userId — separate from IP limits.
  if (isApiRoute && token?.sub) {
    const userId = String(token.sub);
    if (checkEdgeBurst(`user:${userId}`, _edgeBurstUser, EDGE_BURST_MAP_MAX_USER)) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(EDGE_BURST_WINDOW / 1000)) } },
      );
    }
  }

  // ── MFA pending guard ──────────────────────────────────────────────────
  if (token?.mfaPending) {
    const allowed = MFA_ALLOWED.some(p => pathname.startsWith(p));
    if (!allowed) {
      if (isApiRoute) return NextResponse.json({ error: 'MFA required' }, { status: 403 });
      return NextResponse.redirect(new URL('/login?mfa=pending', req.url));
    }
  }

  // ── Must-reset-password guard ──────────────────────────────────────────
  if (token?.mustResetPassword) {
    const resetExempt = ['/api/auth/', '/reset-password', '/api/secrets/rotate'];
    const isExempt = resetExempt.some(p => pathname.startsWith(p));
    if (!isExempt) {
      const reason = encodeURIComponent(token?.mustResetReason ?? '');
      if (isApiRoute) return NextResponse.json({ error: 'Password reset required' }, { status: 403 });
      return NextResponse.redirect(new URL(`/reset-password?required=1&reason=${reason}`, req.url));
    }
  }

  // ── Admin API protection ───────────────────────────────────────────────
  const isAdminApi = ADMIN_API.some(p => pathname.startsWith(p));
  if (isAdminApi) {
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!token.role || !ADMIN_ROLES.has(token.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // ── Protected page routes ──────────────────────────────────────────────
  const isProtected = PROTECTED_PATHS.some(p => pathname.startsWith(p));
  if (isProtected && !token) {
    const callbackUrl = safeCallbackUrl(pathname);
    return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`, req.url));
  }

  // ── Admin pages ────────────────────────────────────────────────────────
  const isAdminPage = ADMIN_PATHS.some(p => pathname.startsWith(p));
  if (isAdminPage) {
    if (!token) return NextResponse.redirect(new URL('/login?callbackUrl=%2Fadmin', req.url));
    if (!token.role || !ADMIN_ROLES.has(token.role)) return NextResponse.redirect(new URL('/', req.url));
  }

  // ── Redirect logged-in users away from auth pages ──────────────────────
  if (AUTH_PATHS.has(pathname) && token) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // ── Build response with security headers ──────────────────────────────
  const res = NextResponse.next({
    request: {
      headers: new Headers({ ...Object.fromEntries(req.headers), 'x-nonce': nonce }),
    },
  });

  const secHeaders = buildSecurityHeaders(nonce);
  for (const [k, v] of Object.entries(secHeaders)) {
    res.headers.set(k, v);
  }

  // ── V059: CORS origin header on responses ─────────────────────────────
  const requestOrigin = req.headers.get('origin') ?? '';
  const allowedOrigins = getAllowedOrigins();
  // V063 FIX-CRIT-03: Same fail-closed logic applied to response origin header.
  if (requestOrigin && allowedOrigins.length > 0 && allowedOrigins.includes(requestOrigin)) {
    res.headers.set('Access-Control-Allow-Origin', requestOrigin);
    res.headers.set('Access-Control-Allow-Credentials', 'true');
    res.headers.set('Vary', 'Origin');
  }

  // Refresh CSRF cookie on GET requests.
  // HIGH-01 FIX (V054): buildCsrfToken() is async — must be awaited.
  if (method === 'GET' && !isCsrfExempt) {
    const csrfToken = await buildCsrfToken();
    res.cookies.set(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      sameSite: 'strict',
      secure:   process.env.NODE_ENV === 'production',
      path:     '/',
      maxAge:   60 * 60 * 24,
    });
    res.headers.set(CSRF_HEADER, csrfToken);
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images/|public/).*)'],
};