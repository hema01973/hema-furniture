// src/... — HemaV066: FIX #2 — ObjectId validation
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB, Coupon } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody, validateObjectId } from '@/lib/api';
import { requirePermission } from '@/lib/authz';

type Ctx = { params: { id: string } };

// V004 FIX: PUT used to skip the percentage <= 100 invariant that POST has,
// so an admin could create a 50% coupon and then PUT { value: 200 } to bypass
// the limit. We now apply the same bounds checks AND, when only `value` is
// supplied (without `type`), we re-read the existing document to validate
// against its stored `type`.
const UpdateSchema = z.object({
  code:          z.string().min(2).max(50).transform(v => v.toUpperCase().trim()).optional(),
  type:          z.enum(['percentage', 'fixed']).optional(),
  value:         z.number().positive().max(1_000_000).optional(),
  minOrderValue: z.number().min(0).max(10_000_000).optional(),
  maxUses:       z.number().int().positive().max(1_000_000).nullable().optional(),
  expiresAt:     z.string().datetime().nullable().optional(),
  isActive:      z.boolean().optional(),
});
// V011: P2-01 — removed misleading rate-limit options that were being passed
// to z.object()'s RawCreateParams (silently ignored). The real rate limit is
// applied by withErrorHandler() on each handler below.

// PUT /api/v1/admin/coupons/:id
export const PUT = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  const auth = await requirePermission(req, 'write:coupon');
  if (!auth.ok) return auth.response;
  const idErr = validateObjectId(params.id);
  if (idErr) return idErr;

  const v = await validateBody(req, UpdateSchema);
  if ('error' in v) return v.error;
  await connectDB();

  if (typeof v.data.value === 'number') {
    const existing = await (Coupon.findById as any)(params.id).select('type').lean() as { type: string } | null;
    if (!existing) return err('Coupon not found', 404);
    const effectiveType = v.data.type ?? existing.type;
    if (effectiveType === 'percentage' && v.data.value > 100) {
      return err('Percentage coupon value cannot exceed 100', 400);
    }
  }

  const coupon = await (Coupon.findByIdAndUpdate as any)(params.id, v.data, { new: true, runValidators: true });
  if (!coupon) return err('Coupon not found', 404);
  return ok(coupon);
}, { rateMax: 10, rateWindow: 60 }); // V010 (W3): 30/min admin coupon write

// DELETE /api/v1/admin/coupons/:id
export const DELETE = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  const auth = await requirePermission(req, 'delete:coupon');
  if (!auth.ok) return auth.response;
  const idErr2 = validateObjectId(params.id);
  if (idErr2) return idErr2;
  await connectDB();
  const coupon = await (Coupon.findByIdAndDelete as any)(params.id);
  if (!coupon) return err('Coupon not found', 404);
  return ok({ message: 'Coupon deleted' });
}, { rateMax: 10, rateWindow: 60 }); // V010 (W3): 30/min admin coupon write
