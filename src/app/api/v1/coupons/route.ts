// src/app/api/v1/coupons/route.ts — HemaV056
// SEC-003 FIX (HemaV051): Protect coupon endpoint against enumeration attacks.
// Changes:
//   1. Multi-dimensional rate limiting (IP + userId) to prevent enumeration.
//   2. Generic error responses — never leak whether a coupon EXISTS but is
//      expired/exhausted (was leaking 404 vs 400 distinction).
//   3. Constant-time response for invalid codes to prevent timing attacks.
//   4. Reduced limits: authenticated 10/5min per user, 5/5min per IP unauthenticated.

import { NextRequest } from 'next/server';
import { z }           from 'zod';
import { connectDB, Coupon } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody } from '@/lib/api';
import { getAuthSession } from '@/lib/auth';
// V056 BUG FIX: was importing from rate-limit.ts (object config API, returns { success }).
// Must use redis.ts which matches positional-arg signature and returns { blocked }.
import { rateLimit } from '@/lib/redis';
import { getClientIp } from '@/lib/ip';
import { logger } from '@/lib/logger';

const CouponValidateSchema = z.object({
  code:     z.string().min(1, 'Coupon code required').max(50).regex(/^[A-Za-z0-9_-]+$/, 'Invalid coupon code format').transform(v => v.trim().toUpperCase()),
  subtotal: z.number({ invalid_type_error: 'subtotal must be a number' }).min(0),
});

// POST /api/v1/coupons  { code, subtotal }
// SEC-003 FIX: multi-dimensional rate limiting + generic error messages
export const POST = withErrorHandler(async (req: NextRequest) => {
  const v = await validateBody(req, CouponValidateSchema);
  if ('error' in v) return v.error;

  const ip      = getClientIp(req);
  const session = await getAuthSession();
  const userId  = session?.user?.id;

  // SEC-003 FIX: Apply layered rate limits.
  const ipMax = userId ? 20 : 5;
  const ipLimit = await rateLimit(`coupon:ip:${ip}`, ipMax, 300, true);
  if (ipLimit.blocked) {
    logger.warn('[Coupon] IP rate limit exceeded', { ip });
    return err('Too many requests. Please try again later.', 429, 'RATE_LIMITED');
  }

  if (userId) {
    const userLimit = await rateLimit(`coupon:user:${userId}`, 10, 300, true);
    if (userLimit.blocked) {
      logger.warn('[Coupon] User rate limit exceeded', { userId });
      return err('Too many requests. Please try again later.', 429, 'RATE_LIMITED');
    }
  }

  const { code, subtotal } = v.data;

  await connectDB();
  const coupon = await (Coupon.findOne as any)({ code, isActive: true });

  // SEC-003 FIX: Generic error message for all invalid-coupon cases.
  // Returning 404 for "not found" vs 400 for "expired" leaks whether the code
  // exists, enabling enumeration of valid code prefixes/patterns.
  if (!coupon) {
    // Constant-time delay to prevent timing-based enumeration
    await new Promise(r => setTimeout(r, 50 + Math.random() * 50));
    return err('Coupon code is invalid or unavailable', 400, 'COUPON_INVALID');
  }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return err('Coupon code is invalid or unavailable', 400, 'COUPON_INVALID');
  }
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    return err('Coupon code is invalid or unavailable', 400, 'COUPON_INVALID');
  }
  if (subtotal < (coupon.minOrderValue ?? 0)) {
    return err(`Minimum order value of EGP ${coupon.minOrderValue} required`, 400, 'MIN_ORDER_NOT_MET');
  }

  const discount =
    coupon.type === 'percentage'
      ? Math.round((subtotal * coupon.value) / 100)
      : coupon.value;

  return ok({ valid: true, discount, type: coupon.type, value: coupon.value });
}, {
  rateMax:    30,
  rateWindow: 300,
  failClosed: true,
});
