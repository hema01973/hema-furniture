// src/app/api/coupons/route.ts
import { NextRequest } from 'next/server';
import { connectDB, Coupon } from '@/lib/mongodb';
import { ok, err, withErrorHandler } from '@/lib/api';

// POST /api/coupons/validate  { code, subtotal }
export const POST = withErrorHandler(async (req: NextRequest) => {
  const { code, subtotal } = await req.json();
  if (!code) return err('Coupon code required', 400);
  await connectDB();
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
  if (!coupon) return err('Invalid coupon code', 404);
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return err('Coupon has expired', 400);
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return err('Coupon usage limit reached', 400);
  if (subtotal < (coupon.minOrderValue ?? 0)) return err(`Minimum order value is EGP ${coupon.minOrderValue}`, 400);
  const discount = coupon.type === 'percentage' ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
  return ok({ valid: true, discount, type: coupon.type, value: coupon.value });
});
