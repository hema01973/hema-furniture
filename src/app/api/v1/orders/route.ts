// src/app/api/v1/orders/route.ts — HemaV066
// MED-02 FIX (V066): Guest order claim tokens now use CLAIM_TOKEN_SECRET (independent rotation
//   schedule). Previously used NEXTAUTH_SECRET — key rotation immediately invalidated all outstanding
//   7-day claim tokens, locking guests out of their order history.
// V064 FIX-HIGH-04: Guest order claim token — signed JWT (HS256, 7-day TTL) returned
//   for guest orders so guests can retrieve their order later without an account.
//   claimTokenHash (SHA-256) stored on Order document; full token in response only.
// LOW-02 FIX (V062): Admin order list upgraded to cursor-based pagination.
//   Skip/limit was O(N) — at skip=10000, MongoDB scans 10K documents.
//   Cursor pagination uses indexed _id field: O(1) cost regardless of offset.
//   Backward compatible: page/limit params still work for client-facing endpoints.
// V056: sanitize + max on all text fields, max quantity cap
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createHash } from 'crypto';
import { SignJWT } from 'jose';
import { revalidateTag } from 'next/cache';
import { ok, err, withErrorHandler, validateBody, getPagination, getCursorPagination, withDbRetry } from '@/lib/api';
import { requireAnyPermission, hasPermission } from '@/lib/authz';
import { connectDB, Order } from '@/lib/mongodb';
import { createOrder } from '@/services/order.service';
import { sanitize, sanitizeEmail } from '@/lib/sanitize';

// V063 FIX-CRIT-02: Validate order status against allowed enum before use in DB filter.
// Previously any string was accepted, leaking arbitrary values into the Mongoose query.
const VALID_ORDER_STATUSES = new Set([
  'pending', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refunded',
]);

const CreateOrderSchema = z.object({
  customer: z.object({
    firstName: z.string().min(2).max(100).transform(v => sanitize(v)),
    lastName:  z.string().min(2).max(100).transform(v => sanitize(v)),
    email:     z.string().email('Valid email required').transform(v => sanitizeEmail(v)),
    // Egyptian mobile: starts with 01, 11 digits — allow +20 prefix too, cap at 20
    phone:     z.string().min(11).max(20).regex(/^(\+20)?0[0-9]{10}$/, 'Valid Egyptian phone required'),
  }),
  shippingAddress: z.object({
    street:      z.string().min(5).max(300).transform(v => sanitize(v)),
    city:        z.string().min(2).max(100).transform(v => sanitize(v)),
    governorate: z.string().min(2).max(100).transform(v => sanitize(v)),
    postalCode:  z.string().max(20).optional(),
  }),
  items: z.array(z.object({
    // productId must be a valid MongoDB ObjectId
    productId:     z.string().regex(/^[a-f\d]{24}$/i, 'Invalid productId'),
    // cap quantity — prevents ordering 999 999 units and exhausting stock in one request
    quantity:      z.number().int().min(1).max(100),
    selectedColor: z.string().max(50).optional(),
  })).min(1, 'Cart is empty').max(50, 'Too many items'),
  paymentMethod: z.enum(['cod', 'card', 'paymob', 'fawry', 'valu']).default('cod'),
  couponCode:    z.string().max(50).optional(),
  notes:         z.string().max(500).transform(v => sanitize(v)).optional(),
});

// FIND-004 FIX: rate-limit GET /api/v1/orders — list-orders endpoint was
// unbounded, allowing enumeration and DoS by paginating through all orders.
export const GET = withErrorHandler(async (req: NextRequest) => {
  // V005: anyone with either order-read permission can call. We then narrow
  // the filter by ownership unless the user has `read:order:any`.
  const auth = await requireAnyPermission(req, ['read:order:any', 'read:order:own']);
  if (!auth.ok) return auth.response;
  await connectDB();
  const url       = new URL(req.url);
  const status    = url.searchParams.get('status');
  const canSeeAll = hasPermission(auth.session.user.role as string, 'read:order:any');

  const baseFilter: Record<string, unknown> = {};
  if (!canSeeAll) baseFilter.userId = auth.session.user.id;
  // V063 FIX-CRIT-02: Only apply status filter if it matches a known enum value.
  if (status && status !== 'all' && VALID_ORDER_STATUSES.has(status)) {
    baseFilter.status = status;
  }

  // LOW-02 FIX (V062): Admin list uses cursor pagination (O(1) cost at any offset).
  // Customer-facing list uses traditional page/limit for backward compatibility.
  if (canSeeAll && url.searchParams.has('cursor')) {
    const { cursorFilter, limit, cursor } = getCursorPagination(req);
    const filter = { ...baseFilter, ...cursorFilter };
    const orders = await (Order.find as any)(filter).sort({ _id: -1 }).limit(limit + 1).lean();
    const hasMore     = orders.length > limit;
    const pageOrders  = hasMore ? orders.slice(0, limit) : orders;
    const nextCursor  = hasMore ? String(pageOrders.at(-1)?._id) : null;
    return ok({ orders: pageOrders, nextCursor, hasPreviousPage: Boolean(cursor) });
  }

  // Traditional page/limit (customer-facing, backward compatible)
  // MED-003 FIX (V068): For authenticated customer routes, compute the per-user count so
  // the frontend can render correct pagination. estimatedDocumentCount() returned a
  // collection-wide estimate (e.g. 15,000) regardless of the user's actual order count,
  // breaking all client-side pagination. Per-user countDocuments() is safe and correct.
  // Note: Admin routes use cursor-based pagination (above) and don't need a total.
  const { page, limit, skip } = getPagination(req);
  const [orders, total] = await Promise.all([
    (Order.find as any)(baseFilter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(baseFilter),
  ]);

  return ok({ orders, pagination: { page, limit, total } });
}, { rateMax: 30, rateWindow: 60 });

export const POST = withErrorHandler(
  async (req: NextRequest) => {
    const v = await validateBody(req, CreateOrderSchema);
    if ('error' in v) return v.error;

    // V009: read idempotency key from header (RFC convention) so retried POSTs
    // do not create duplicate orders (network glitch, double-click, etc.).
    const idempotencyKey = req.headers.get('idempotency-key')?.slice(0, 100) || undefined;

    // SEC-004 FIX (HemaV051): Multi-dimensional rate limiting for guest checkout.
    // Authenticated users get more generous limits; guests are restricted by
    // email + phone + IP to prevent spam orders and fraud.
    const { getAuthSession } = await import('@/lib/auth');
    // V056 BUG FIX: was incorrectly importing from '@/lib/rate-limit' (object config API, returns { success }).
    // Must use '@/lib/redis' which has positional args and returns { blocked, remaining, retryAfterSec }.
    const { rateLimit }      = await import('@/lib/redis');
    const { getClientIp }    = await import('@/lib/ip');
    const session = await getAuthSession();
    const isGuest = !session?.user?.id;
    const ip      = getClientIp(req);

    if (isGuest) {
      const emailKey = `order:email:${v.data.customer.email.toLowerCase()}`;
      const phoneKey = `order:phone:${v.data.customer.phone}`;
      const ipKey    = `order:ip:${ip}`;

      const [emailLimit, phoneLimit, ipLimit] = await Promise.all([
        rateLimit(emailKey, 3,  3600, true),
        rateLimit(phoneKey, 3,  3600, true),
        rateLimit(ipKey,    10, 3600, true),
      ]);

      const isBlocked = emailLimit.blocked || phoneLimit.blocked || ipLimit.blocked;
      if (isBlocked) {
        const { logger } = await import('@/lib/logger');
        logger.warn('[Orders] Guest checkout rate limited', { ip, email: v.data.customer.email });
        return err('Too many orders. Please try again later.', 429, 'RATE_LIMITED');
      }
    }

    try {
      // V060 FIX-E: withDbRetry wraps createOrder for transient DB failures.
      const result = await withDbRetry('createOrder', () => createOrder({
        ...v.data,
        paymentMethod: v.data.paymentMethod ?? 'cod',
        idempotencyKey,
      }));
      revalidateTag('products');

      // HIGH-04 FIX (V064): For guest orders, generate a signed claim token so the
      // guest can retrieve their order later without creating an account (GDPR data-access right).
      // The full token is returned ONCE in this response — only the SHA-256 hash is stored in DB.
      let claimToken: string | undefined;
      if (isGuest && result.order.orderId) {
        // MED-02 FIX (V066): Use dedicated CLAIM_TOKEN_SECRET — independent rotation schedule
        // (90+ days recommended) so NEXTAUTH_SECRET rotations do NOT invalidate outstanding
        // 7-day claim tokens. Falls back to NEXTAUTH_SECRET for backward compatibility when
        // CLAIM_TOKEN_SECRET is not yet set in the deployment environment.
        const secretsLib = await import('@/lib/secrets');
        const secret = secretsLib.getSecretSync('CLAIM_TOKEN_SECRET')
                    ?? secretsLib.getSecretSync('NEXTAUTH_SECRET');
        if (secret) {
          const secretBytes = new TextEncoder().encode(secret);
          claimToken = await new SignJWT({ orderId: result.order.orderId, orderNumber: result.order.orderNumber })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d')
            .sign(secretBytes);
          // Store hash on Order document for later lookup
          const claimTokenHash = createHash('sha256').update(claimToken).digest('hex');
          await connectDB();
          await (Order.findByIdAndUpdate as any)(result.order.orderId, { $set: { claimTokenHash } });
        }
      }

      const responsePayload: Record<string, unknown> = {
        order:     result.order,
        iframeUrl: result.iframeUrl,
        warning:   result.warning,
      };
      if (claimToken) responsePayload.claimToken = claimToken;

      return ok(responsePayload, 201);
    } catch (error: unknown) {
      if (error instanceof Error && 'status' in error) {
        return err(error.message, (error as Error & { status: number }).status);
      }
      // Mongo duplicate-key on idempotencyKey → race on concurrent retry; resolve to 409
      if (error instanceof Error && /duplicate key/i.test(error.message) && /idempotencyKey/.test(error.message)) {
        return err('Duplicate request — please retry without resubmitting.', 409, 'DUPLICATE_REQUEST');
      }
      throw error;
    }
  },
  { failClosed: true, rateMax: 20, rateWindow: 3600 }
);
