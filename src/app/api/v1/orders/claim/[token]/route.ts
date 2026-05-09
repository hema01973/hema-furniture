// src/app/api/v1/orders/claim/[token]/route.ts — HemaV076
// V064 FIX-HIGH-04: Guest order claim endpoint.
//
// Allows a guest to retrieve their order using the signed claim token that was
// returned in the POST /api/v1/orders response at checkout time. This satisfies
// the GDPR right of access for guests who did not create an account.
//
// Security model:
//   - Token is HS256 JWT signed with NEXTAUTH_SECRET, 7-day TTL.
//   - Only the SHA-256 hash of the token is stored in the DB (claimTokenHash).
//   - Brute-force protection: rateMax:5/60s per IP. The token is 256+ bits of
//     entropy so offline brute-force is not feasible.
//   - Returns only fields safe for guest display (same as tracking endpoint).

import { NextRequest }                  from 'next/server';
import { createHash }                   from 'crypto';
import { jwtVerify }                    from 'jose';
import { connectDB, Order }             from '@/lib/mongodb';
import { ok, err, withErrorHandler }    from '@/lib/api';

/** Fields safe to return to the order owner (guest). */
const CLAIM_PROJECTION = {
  orderNumber:     1,
  status:          1,
  paymentStatus:   1,
  paymentMethod:   1,
  items:           1,
  subtotal:        1,
  shipping:        1,
  discount:        1,
  total:           1,
  customer:        1,
  shippingAddress: 1,
  createdAt:       1,
  estimatedDelivery: 1,
} as const;

/**
 * GET /api/v1/orders/claim/[token]
 *
 * Verifies a guest order claim JWT and returns the corresponding order.
 * The token is the one returned in the POST /api/v1/orders response body
 * (field: claimToken). It is valid for 7 days after order creation.
 */
type Ctx = { params: { token: string } };

export const GET = withErrorHandler(
  async (req: NextRequest, ctx: unknown) => {
    const { params } = ctx as Ctx;
    const { token } = params;

    if (!token || typeof token !== 'string') {
      return err('Missing claim token', 400, 'MISSING_TOKEN');
    }

    // MED-02 FIX (V066): Use CLAIM_TOKEN_SECRET with fallback to NEXTAUTH_SECRET,
    // matching the signing logic in orders/route.ts POST handler.
    const secretsLib = await import('@/lib/secrets');
    const secret = secretsLib.getSecretSync('CLAIM_TOKEN_SECRET')
                ?? secretsLib.getSecretSync('NEXTAUTH_SECRET');
    if (!secret) {
      return err('Service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }

    // Verify JWT signature and expiry
    let orderId: string;
    try {
      const secretBytes = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretBytes);
      orderId = payload.orderId as string;
      if (!orderId) throw new Error('Missing orderId in token payload');
    } catch {
      // Intentionally vague — do not reveal whether token format vs expiry is the issue
      return err('Invalid or expired claim token', 401, 'INVALID_TOKEN');
    }

    // Look up order by claimTokenHash (not orderId) — prevents orderId enumeration
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await connectDB();

    const order = await (Order.findOne as any)(
      { _id: orderId, claimTokenHash: tokenHash },
      CLAIM_PROJECTION,
    ).lean();

    if (!order) {
      return err('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    return ok({ order });
  },
  { rateMax: 5, rateWindow: 60 },
);
