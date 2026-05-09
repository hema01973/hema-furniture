// src/... — HemaV050: isAllowedImageUrl consolidated into lib/validators (MED-01)
import { NextRequest } from 'next/server';
import { z }           from 'zod';
import { connectDB, Product } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody } from '@/lib/api';
import { requirePermission } from '@/lib/authz';
import { sanitize } from '@/lib/sanitize';
import { isAllowedImageUrl } from '@/lib/validators';

type Context = { params: { id: string } };

const CATEGORY_VALUES = ['living', 'bedroom', 'dining', 'office', 'outdoor'] as const;

// ── Strict allowlist for every field an admin can update ──────────
// Fields NOT listed here (e.g. _id, slug, sku, reviewCount) are ignored,
// preventing mass-assignment / prototype-pollution attacks.
const UpdateProductSchema = z.object({
  nameEn:        z.string().min(2).max(200).transform(v => sanitize(v)).optional(),
  nameAr:        z.string().min(2).max(200).transform(v => sanitize(v)).optional(),
  descEn:        z.string().max(5000).transform(v => sanitize(v)).optional(),
  descAr:        z.string().max(5000).transform(v => sanitize(v)).optional(),
  price:         z.number().positive('Price must be greater than 0').optional(),
  oldPrice:      z.number().positive().nullable().optional(),
  category:      z.union([
    z.enum(CATEGORY_VALUES),
    z.object({ main: z.enum(CATEGORY_VALUES), sub: z.string().max(50).optional() }),
  ]).optional(),
  // V040 FIX [MED-01]: image URLs validated against shared allowlist in lib/validators
  images:        z.array(
    z.string().url()
      .refine(isAllowedImageUrl, 'Image must be hosted on an allowed domain (Cloudinary, Unsplash, or Placehold)')
  ).min(1).max(20).optional(),
  stock:         z.number().int().min(0).optional(),
  badge:         z.enum(['New', 'Sale', 'Best Seller', 'Limited']).nullable().optional(),
  material:      z.string().max(200).transform(v => sanitize(v)).optional(),
  materialAr:    z.string().max(200).transform(v => sanitize(v)).optional(),
  colors:        z.array(z.string().max(50)).max(20).optional(),
  brand:         z.string().max(100).transform(v => sanitize(v)).optional(),
  tags:          z.array(z.string().max(50)).max(20).optional(),
  isActive:      z.boolean().optional(),
  isFeatured:    z.boolean().optional(),
  warrantyYears: z.number().int().min(0).max(20).optional(),
  metaTitle:     z.string().max(200).transform(v => sanitize(v)).optional(),
  metaDesc:      z.string().max(500).transform(v => sanitize(v)).optional(),
  dimensions: z.object({
    width:  z.number().positive().optional(),
    depth:  z.number().positive().optional(),
    height: z.number().positive().optional(),
    unit:   z.enum(['cm', 'inch']).optional(),
  }).optional(),
  weight:        z.number().positive().max(10_000).optional(),
})
// V004 FIX: cross-field invariant — `oldPrice` only makes sense as a "was"
// price, so it must be strictly greater than the current `price`. Without
// this check an admin could set oldPrice=10, price=100 and the storefront
// would render a phantom discount badge that misleads customers (and risks
// consumer-protection complaints). Only enforced when both fields arrive
// in the same request; partial updates are still allowed.
.refine(
  (d) => d.oldPrice == null || d.price == null || d.oldPrice > d.price,
  { message: 'oldPrice must be greater than price', path: ['oldPrice'] },
);

// GET /api/v1/products/:id  (by MongoDB ID or slug)
// MED-04 FIX (V065): Validate slug/id length before hitting the DB.
// An unbounded slug allows callers to send kilobytes of data to MongoDB's
// $regex or string comparison paths, potentially causing slow query plans.
// Max slug length mirrors the Mongoose schema constraint (200 chars for nameEn
// → slugify → max ~220 chars; cap at 250 to be safe while rejecting junk).
const MAX_SLUG_LENGTH = 250;
export const GET = withErrorHandler(async (_req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Context;

  // MED-04 FIX (V065): Reject oversized identifiers before any DB interaction.
  if (!params.id || params.id.length > MAX_SLUG_LENGTH) {
    return err('Invalid product identifier', 400, 'INVALID_ID');
  }
  // Allow only safe slug characters (alphanumeric + hyphen) for non-ObjectId lookups
  const isObjectId = /^[a-f\d]{24}$/i.test(params.id);
  if (!isObjectId && !/^[a-z0-9-]+$/i.test(params.id)) {
    return err('Invalid product identifier', 400, 'INVALID_ID');
  }

  await connectDB();
  const query = isObjectId ? { _id: params.id } : { slug: params.id };
  const product = await (Product.findOne as any)({ ...query, isActive: true }).lean();
  if (!product) return err('Product not found', 404);
  return ok(product);
});

// PUT /api/v1/products/:id
export const PUT = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Context;
  const auth = await requirePermission(req, 'write:product');
  if (!auth.ok) return auth.response;

  const v = await validateBody(req, UpdateProductSchema);
  if ('error' in v) return v.error;
  await connectDB();

  const payload: Record<string, unknown> = { ...v.data };
  if (payload.category && typeof payload.category === 'string') {
    payload.category = { main: payload.category };
  }

  const product = await (Product.findByIdAndUpdate as any)(
    params.id, payload, { new: true, runValidators: true },
  );
  if (!product) return err('Product not found', 404);
  return ok(product);
});

// DELETE /api/v1/products/:id  (soft-delete: sets isActive = false)
export const DELETE = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Context;
  const auth = await requirePermission(req, 'delete:product');
  if (!auth.ok) return auth.response;
  await connectDB();
  const product = await (Product.findByIdAndUpdate as any)(
    params.id, { isActive: false }, { new: true },
  );
  if (!product) return err('Product not found', 404);
  return ok({ message: 'Product deactivated' });
});
