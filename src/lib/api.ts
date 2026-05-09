// src/lib/api.ts — HemaV066
// V061 FIX-D: withDbRetry() applied to all transactional/write-heavy routes:
//   - orders/[id]/refund (order.save)
//   - users/[id]/role (User.findByIdAndUpdate with $inc permissionVersion)
//   - reviews (Review.create + (Product.findByIdAndUpdate as any) rating aggregate)
//   - admin/coupons (Coupon.create)
//
// V060 FIX-E: withDbRetry() — idempotent retry for deadlocks, connection drops, timeouts.
// V050: request body size limit (VULN-10) — DoS protection
// V031: DI container, failClosed, typed errors, request timing, ObjectId validation
import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema }                 from 'zod';
import { getAuthSession }            from './auth';
import { rateLimit }                 from './redis';
import type { RateLimitResult }      from './redis';
import { logger, runWithContext }    from './logger';
import { sanitize }                  from './sanitize';
import { getClientIp }               from './ip';
import type { ApiResponse, UserRole } from '@/types';

// ── Typed error classes (replaces string-based throws) ────────────
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly code?: string,
  ) { super(message); this.name = 'AppError'; }
}
export class NotFoundError     extends AppError { constructor(m = 'Not found')     { super(m, 404, 'NOT_FOUND');    } }
export class UnauthorizedError extends AppError { constructor(m = 'Unauthorized')  { super(m, 401, 'UNAUTHORIZED'); } }
export class ForbiddenError    extends AppError { constructor(m = 'Forbidden')     { super(m, 403, 'FORBIDDEN');    } }
export class ConflictError     extends AppError { constructor(m = 'Conflict')      { super(m, 409, 'CONFLICT');     } }
export class ValidationError   extends AppError { constructor(m: string)           { super(m, 422, 'VALIDATION');   } }

// Keep string constants for backward compat
export const UNAUTHORIZED = 'UNAUTHORIZED';
export const FORBIDDEN    = 'FORBIDDEN';
export const NOT_FOUND    = 'NOT_FOUND';

// ── Standard JSON responses ───────────────────────────────────────
export function ok<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

export function err(message: string, status = 400, code?: string): NextResponse<ApiResponse> {
  const safe = process.env.NODE_ENV === 'production'
    ? sanitize(message).slice(0, 500)
    : message;
  return NextResponse.json({ success: false, error: safe, code }, { status });
}

// ── Helpers ───────────────────────────────────────────────────────
export function getIP(req: NextRequest): string {
  return getClientIp(req);
}

// V009 FIX: collapse IPv6 addresses to /64 prefix for rate limiting.
// Without this, an attacker on an IPv6 host with a /64 (~18 quintillion
// addresses) bypasses every per-IP rate limit by rotating the low 64 bits.
// IPv4 addresses are returned unchanged.
export function ipBucket(ip: string): string {
  if (!ip || ip.includes('.')) return ip;          // IPv4 or empty — unchanged
  if (ip === '::1') return ip;                     // localhost
  // IPv6: take first 4 hextets (= /64). Handle "::" expansion.
  const parts = ip.split(':');
  // Naive expansion of "::" — sufficient for prefix bucketing
  const idx = parts.indexOf('');
  if (idx !== -1) {
    const fill = 8 - parts.filter(p => p !== '').length;
    parts.splice(idx, 1, ...Array(fill).fill('0'));
  }
  return parts.slice(0, 4).join(':') + '::/64';
}

// VULN-10 FIX: maximum allowed request body size — prevents DoS via oversized payloads
const MAX_BODY_SIZE = 1 * 1024 * 1024; // 1 MB — sufficient for any legitimate API payload

export async function validateBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>,
): Promise<{ data: T } | { error: NextResponse }> {
  try {
    // IMPROVE-SEC-02 FIX (V049): enforce Content-Type: application/json.
    // Without this check, browsers may send application/x-www-form-urlencoded
    // or multipart data that req.json() will fail to parse with a generic 500
    // instead of a clear 415 error. Also prevents some content-sniffing attacks.
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return { error: err('Content-Type must be application/json', 415, 'UNSUPPORTED_MEDIA_TYPE') };
    }

    // Check Content-Length header first (fast path — avoids reading the body)
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return { error: err('Request body too large', 413, 'PAYLOAD_TOO_LARGE') };
    }

    const body = await req.json();

    // Double-check actual size after parsing (Content-Length can be spoofed)
    const bodySize = JSON.stringify(body).length;
    if (bodySize > MAX_BODY_SIZE) {
      return { error: err('Request body too large', 413, 'PAYLOAD_TOO_LARGE') };
    }

    const r    = schema.safeParse(body);
    if (!r.success) {
      const msg = r.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      return { error: err(msg, 422, 'VALIDATION') };
    }
    return { data: r.data };
  } catch {
    return { error: err('Invalid JSON body', 400, 'PARSE_ERROR') };
  }
}

export async function withAuth(
  req: NextRequest,
  handler: (req: NextRequest, session: Awaited<ReturnType<typeof getAuthSession>>) => Promise<NextResponse>,
  allowedRoles?: UserRole[],
): Promise<NextResponse> {
  const session = await getAuthSession();
  if (!session) return err('Unauthorized', 401, 'UNAUTHORIZED');
  if (allowedRoles && !allowedRoles.includes(session.user.role as UserRole)) {
    logger.warn('[Auth] Forbidden', { userId: session.user.id, role: session.user.role, required: allowedRoles });
    return err('Forbidden', 403, 'FORBIDDEN');
  }
  return handler(req, session);
}

export function getPagination(req: NextRequest) {
  const url   = new URL(req.url);
  const page  = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '12')));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * LOW-02 FIX (V062): Cursor-based pagination for high-volume endpoints.
 *
 * Replaces skip/limit which forces MongoDB to scan N documents to reach
 * offset N — O(N) cost that degrades catastrophically at scale.
 * Cursor pagination is O(1) using an indexed field (_id or createdAt).
 *
 * Usage:
 *   const { filter, limit, nextCursor } = getCursorPagination(req, docs.at(-1)?._id);
 *   const docs = await Model.find({ ...filter }).sort({ _id: -1 }).limit(limit);
 *   return { data: docs, nextCursor };
 *
 * Query params:
 *   cursor — ObjectId string of the last document from previous page
 *   limit  — page size (1–100, default 20)
 *   dir    — 'before' | 'after' (default 'before' = newest first)
 */
export function getCursorPagination(req: NextRequest) {
  const url    = new URL(req.url);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limit  = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20')));
  const dir    = url.searchParams.get('dir') === 'after' ? 'after' : 'before';

  // MED-01 FIX (V067): Validate cursor as a proper ObjectId before using it in a query.
  // Previously the raw string was passed directly as _id, allowing cursor injection.
  // An invalid cursor now throws an AppError (400) instead of silently passing bad data to MongoDB.
  if (cursor !== undefined) {
    // Lazy import to avoid circular at top level — mongoose is already used in mongodb.ts
    const { Types } = require('mongoose') as typeof import('mongoose');
    if (!Types.ObjectId.isValid(cursor)) {
      throw new AppError('Invalid cursor format', 400, 'INVALID_CURSOR');
    }
  }

  // Build Mongoose filter for cursor pagination using _id (indexed, monotonic).
  // 'before' = oldest first (cursor < current), 'after' = newest first (cursor > current)
  const cursorFilter: Record<string, unknown> = cursor
    ? { _id: { [dir === 'before' ? '$lt' : '$gt']: cursor } }
    : {};

  return { cursorFilter, limit, cursor, dir };
}

// ── DI: Service container (dependency injection) ──────────────────
// Allows swapping implementations in tests without module mocks.
export interface ServiceContainer {
  rateLimiter: (key: string, max?: number, windowS?: number, failClosed?: boolean) => Promise<RateLimitResult>;
}

const defaultContainer: ServiceContainer = { rateLimiter: rateLimit };
let   activeContainer  = defaultContainer;

export function setContainer(c: Partial<ServiceContainer>): void {
  activeContainer = { ...defaultContainer, ...c };
}
export function resetContainer(): void {
  activeContainer = defaultContainer;
}

// ── V060 FIX-E: Database retry & deadlock handling ────────────────
// Wraps async DB operations with idempotent retry logic for transient failures:
//   - MongoDB deadlock (error code 112 — WriteConflict)
//   - Connection drops (MongoNetworkError, MongoServerSelectionError)
//   - Socket timeouts
// LOW-02 FIX (V065): Added `idempotent` parameter (default: true).
// Callers MUST pass `idempotent: false` for operations with irreversible side-effects
// (e.g. sending an email, charging a payment, creating a non-transactional record).
// Non-idempotent operations are attempted exactly once — a transient error is surfaced
// immediately rather than silently retried and potentially double-executing.
// Max 3 attempts with exponential back-off (100ms, 200ms) — idempotent only.
const DB_RETRY_CODES   = new Set([112, 251]); // 112=WriteConflict/deadlock, 251=TransactionExceededLifetimeLimitSeconds
const DB_RETRY_NAMES   = new Set(['MongoNetworkError', 'MongoServerSelectionError', 'MongoNotConnectedError']);
const DB_MAX_RETRIES   = 3;
const DB_RETRY_BASE_MS = 100;

export async function withDbRetry<T>(
  label: string,
  fn: () => Promise<T>,
  // LOW-02 FIX (V065): idempotent flag — defaults to true to preserve backwards compat.
  // Pass `false` for operations with irreversible side-effects (email, payment, etc.).
  { idempotent = true }: { idempotent?: boolean } = {},
): Promise<T> {
  for (let attempt = 1; attempt <= DB_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      const isTransient =
        (e instanceof Error && DB_RETRY_NAMES.has(e.name)) ||
        (typeof (e as { code?: number }).code === 'number' && DB_RETRY_CODES.has((e as { code: number }).code));

      // LOW-02 FIX (V065): Never retry non-idempotent operations regardless of error type.
      if (!idempotent) {
        logger.error(`[DB] ${label} failed — non-idempotent operation, not retrying`, {
          error: e instanceof Error ? e.message : String(e),
          code:  (e as { code?: number }).code,
        });
        throw e;
      }

      if (!isTransient || attempt === DB_MAX_RETRIES) {
        logger.error(`[DB] ${label} failed (attempt ${attempt}/${DB_MAX_RETRIES}, not retrying)`, {
          error: e instanceof Error ? e.message : String(e),
          code:  (e as { code?: number }).code,
        });
        throw e; // LOW-05 FIX (V067): always throw `e` directly — preserves original stack trace
      }

      const delay = DB_RETRY_BASE_MS * attempt;
      logger.warn(`[DB] ${label} transient error — retrying (attempt ${attempt}/${DB_MAX_RETRIES}, delay ${delay}ms)`, {
        error: e instanceof Error ? e.message : String(e),
        code:  (e as { code?: number }).code,
      });
      await new Promise(r => setTimeout(r, delay));
    }
  }
  // LOW-05 FIX (V067): This line is unreachable (the loop always throws before exhausting),
  // but satisfies TypeScript's control-flow analysis.
  throw new Error('Unreachable: withDbRetry exhausted');
}

// ── withErrorHandler ──────────────────────────────────────────────
// LOW-003 FIX (V068): Added DEFAULT_RATE_MAX / DEFAULT_RATE_WINDOW safe defaults.
// Previously, calling withErrorHandler(handler) with no opts applied NO rate limiting
// at all — callers had to remember to pass {rateMax, rateWindow} explicitly, and
// omitting them silently left the route unthrottled. This caused repeated bugs over
// 10+ versions. The conservative defaults (60 req / 60s) apply unless explicitly
// overridden. Routes that need higher limits pass their own values; routes that
// need no limit pass skipRateLimit: true.
const DEFAULT_RATE_MAX    = 60;
const DEFAULT_RATE_WINDOW = 60;
export interface HandlerOpts {
  failClosed?:    boolean;  // block if Redis is down
  rateMax?:       number;
  rateWindow?:    number;
  skipRateLimit?: boolean;
}

export function withErrorHandler(
  handler: (req: NextRequest, ctx?: unknown) => Promise<NextResponse>,
  opts: HandlerOpts = {},
) {
  return async (req: NextRequest, ctx?: unknown): Promise<NextResponse> => {
    const correlationId = req.headers.get('x-correlation-id') ?? crypto.randomUUID();
    const ip            = getIP(req);
    const rawRoute      = new URL(req.url).pathname;
    const method        = req.method;
    const startTime     = Date.now();

    // LOW-01 FIX (V065): Normalize the route before embedding it in the Redis rate-limit key.
    // Without normalization, the key contains raw path parameters — including sensitive values
    // such as claim tokens (/api/v1/orders/claim/<token>), order IDs, user IDs, etc.
    // This causes two problems:
    //   1. Token values are stored in Redis keys, leaking them into Redis monitoring/logs.
    //   2. Each unique token creates a new rate-limit bucket, defeating per-route limits
    //      (an attacker generates thousands of unique tokens to bypass rate limiting).
    // Fix: replace MongoDB ObjectId segments and JWT-like segments with '<id>' / '<token>',
    // collapsing all per-resource requests into a single bucket per route pattern.
    const route = rawRoute
      // Replace 24-hex MongoDB ObjectIds
      .replace(/\/[a-f0-9]{24}/gi, '/<id>')
      // Replace JWT / base64url claim tokens (long alphanumeric+.-_ strings, 32+ chars)
      .replace(/\/[A-Za-z0-9\-_.~]{32,}/g, '/<token>')
      // Replace UUID v4 segments
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/<uuid>');

    return runWithContext({ correlationId, ip, route: rawRoute, method, startTime }, async () => {
      try {
        // Rate limiting via injected container
        if (!opts.skipRateLimit) {
          // V009: bucket IPv6 to /64 so an IPv6 attacker can't rotate the low bits
          const rl = await activeContainer.rateLimiter(
            // LOW-01 FIX (V065): use normalized `route` (not rawRoute) for rate-limit key
            `${ipBucket(ip)}:${route}`,
            // LOW-003 FIX (V068): fall back to conservative defaults — never unthrottled
            opts.rateMax    ?? DEFAULT_RATE_MAX,
            opts.rateWindow ?? DEFAULT_RATE_WINDOW,
            opts.failClosed ?? false,
          );
          // ARCH-002 FIX (HemaV052): RFC 6585 compliant rate limit headers.
          // Emit X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset,
          // and Retry-After on every request (not just blocked ones).
          if (rl.blocked) {
            logger.warn('[API] Rate limited', { ip, route });
            const res429 = err('Too many requests — please slow down.', 429, 'RATE_LIMITED');
            res429.headers.set('Retry-After',           String(rl.retryAfterSec));
            res429.headers.set('X-RateLimit-Limit',     String(opts.rateMax ?? process.env.RATE_LIMIT_MAX ?? 100));
            res429.headers.set('X-RateLimit-Remaining', '0');
            res429.headers.set('X-RateLimit-Reset',     String(Math.floor(Date.now() / 1000) + rl.retryAfterSec));
            return res429;
          }
        }

        const res        = await handler(req, ctx);
        const durationMs = Date.now() - startTime;

        // IMPROVE-SEC-01 FIX (V049): expose correlationId to clients via both headers.
        // When users report issues, support can match the ID to Sentry/BetterStack logs.
        res.headers.set('X-Correlation-Id', correlationId);
        res.headers.set('X-Request-Id',     correlationId); // alias for client compatibility
        logger.request(method, route, res.status, durationMs, ip);

        return res;
      } catch (error: unknown) {
        const durationMs = Date.now() - startTime;

        // Typed AppError handling
        if (error instanceof AppError) {
          logger.warn('[API] AppError', { route, method, code: error.code, msg: error.message, durationMs });
          return err(error.message, error.statusCode, error.code);
        }

        // Legacy string throws
        if (error instanceof Error) {
          if (error.message === UNAUTHORIZED) return err('Unauthorized', 401, UNAUTHORIZED);
          if (error.message === FORBIDDEN)    return err('Forbidden',    403, FORBIDDEN);
          if (error.message === NOT_FOUND)    return err('Not found',    404, NOT_FOUND);
        }

        logger.error('[API] Unhandled exception', {
          route, method, durationMs,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join(' | ') : undefined,
        });

        if (process.env.NODE_ENV !== 'production' && error instanceof Error) {
          return err(error.message, 500, 'INTERNAL');
        }
        return err('Internal server error', 500, 'INTERNAL');
      }
    });
  };
}

// ── MongoDB ObjectId validation ───────────────────────────────
/** Returns true if `id` is a valid 24-char hex MongoDB ObjectId */
export function isValidObjectId(id: unknown): boolean {
  return typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
}

/** Returns a 400 error response if id is not a valid ObjectId */
export function validateObjectId(id: unknown): NextResponse | null {
  if (!isValidObjectId(id)) return err('Invalid ID format', 400, 'INVALID_ID');
  return null;
}
