// src/... — HemaV066: admin coupon CRUD
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB, Coupon } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody, withDbRetry } from '@/lib/api';
import { requirePermission } from '@/lib/authz';
import { sanitize } from '@/lib/sanitize';

// V004 FIX: percentage discounts MUST be capped at 100. Without this guard
// an admin (or anyone who slipped past role checks) could create value=200
// which produces a negative subtotal at checkout and effectively pays the
// customer to take stock. Also added an explicit upper bound on `value`
// for fixed coupons to prevent absurd amounts.
const CouponSchema = z.object({
  code:          z.string().min(2).max(50).transform(v => v.toUpperCase().trim()),
  type:          z.enum(['percentage', 'fixed']),
  value:         z.number().positive().max(1_000_000),
  minOrderValue: z.number().min(0).max(10_000_000).default(0),
  maxUses:       z.number().int().positive().max(1_000_000).optional(),
  expiresAt:     z.string().datetime().optional().or(z.literal('')).transform(v => v || undefined),
  isActive:      z.boolean().default(true),
}).refine(
  (d) => d.type !== 'percentage' || d.value <= 100,
  { message: 'Percentage coupon value cannot exceed 100', path: ['value'] },
);

// GET /api/v1/admin/coupons
// V005: now uses centralized permission `read:coupon` instead of a hardcoded
// role list. Adding a new role (e.g. `auditor`) is one line in authz.ts.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await requirePermission(req, 'read:coupon');
  if (!auth.ok) return auth.response;
  await connectDB();
  const coupons = await (Coupon.find as any)().sort({ createdAt: -1 }).lean();
  return ok({ coupons });
}, { rateMax: 10, rateWindow: 60 }); // V010 (W3): 30/min admin write

// POST /api/v1/admin/coupons
// V010 (W3): explicit rate cap on admin coupon creation
export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await requirePermission(req, 'write:coupon');
  if (!auth.ok) return auth.response;
  const v = await validateBody(req, CouponSchema);
  if ('error' in v) return v.error;
  await connectDB();
  const exists = await (Coupon.findOne as any)({ code: v.data.code });
  if (exists) return err('Coupon code already exists', 409);
  // V061 FIX-D: withDbRetry — coupon creation is admin write; transient errors must not fail permanently.
  const coupon = await withDbRetry('coupon:create', () => (Coupon.create as any)(v.data));
  return ok(coupon, 201);
}, { rateMax: 10, rateWindow: 60 }); // V010 (W3): 30/min admin write
