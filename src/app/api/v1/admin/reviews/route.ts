// src/app/api/v1/admin/reviews/route.ts — HemaV066
// V065 VULN-06: Added field projection to (Review.find as any)() — full document was returned
//   including all internal fields. Added cursor-based pagination alongside skip/limit
//   to avoid O(N) collection scans at high page numbers.
// V063 FIX-MED-05: Rate limit added — endpoint performs DB scan with no throttle.
// V050: admin review listing with filter
import { NextRequest } from 'next/server';
import { connectDB, Review, Product } from '@/lib/mongodb';
import { ok, err, withErrorHandler, getPagination, getCursorPagination } from '@/lib/api';
import { requirePermission } from '@/lib/authz';

// VULN-06 FIX (V065): Explicit projection — return only fields needed for admin UI.
// Internal fields (flagged, flagReason, etc.) are included; raw user PII beyond
// what is required for the admin task is excluded when not necessary.
const REVIEW_ADMIN_PROJECTION = {
  productId:  1,
  userId:     1,
  rating:     1,
  comment:    1,
  isApproved: 1,
  isFlagged:  1,
  flagReason: 1,
  helpfulCount: 1,
  createdAt:  1,
  updatedAt:  1,
} as const;

// GET /api/v1/admin/reviews?approved=true|false&page=1&limit=20
// GET /api/v1/admin/reviews?approved=true|false&cursor=<id>&limit=20  (cursor mode)
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await requirePermission(req, 'delete:review:any');
  if (!auth.ok) return auth.response;

  await connectDB();
  const url      = new URL(req.url);
  const approved = url.searchParams.get('approved');

  const filter: Record<string, unknown> = {};
  if (approved === 'true')  filter.isApproved = true;
  if (approved === 'false') filter.isApproved = false;

  // VULN-06 FIX (V065): Prefer cursor pagination (O(1) at any depth) when
  // a cursor param is present; fall back to skip/limit for backwards-compat
  // with existing admin UI pages that have not yet been updated.
  if (url.searchParams.has('cursor')) {
    const { cursorFilter, limit } = getCursorPagination(req);
    const safLimit = Math.min(limit, 100);
    const combined = { ...filter, ...cursorFilter };
    // VULN-06 FIX (V065): Project only required fields
    const items = await (Review.find as any)(combined, REVIEW_ADMIN_PROJECTION)
      .sort({ _id: -1 })
      .limit(safLimit + 1)
      .lean();
    const hasMore    = items.length > safLimit;
    const pageItems  = hasMore ? items.slice(0, safLimit) : items;
    const nextCursor = hasMore ? String(pageItems.at(-1)?._id) : null;

    const productIds = [...new Set(pageItems.map((r: any) => r.productId?.toString()))];
    const products   = await (Product.find as any)({ _id: { $in: productIds } })
      .select('nameEn nameAr slug')
      .lean() as Array<{ _id: unknown; nameEn?: string; nameAr?: string; slug?: string }>;
    const productMap = Object.fromEntries(products.map((p: any) => [String(p._id), p]));
    const enriched   = pageItems.map((r: any) => ({ ...r, product: productMap[r.productId?.toString()] ?? null }));

    return ok({ reviews: enriched, nextCursor, hasPreviousPage: Boolean(url.searchParams.get('cursor')) });
  }

  // Legacy skip/limit path — still O(N) but preserved for API backwards-compat.
  const { page, limit, skip } = getPagination(req);
  const safLimit = Math.min(limit, 100);

  const [reviews, total] = await Promise.all([
    // VULN-06 FIX (V065): Project only required fields
    (Review.find as any)(filter, REVIEW_ADMIN_PROJECTION).sort({ createdAt: -1 }).skip(skip).limit(safLimit).lean(),
    Review.countDocuments(filter),
  ]);

  // Attach product names for display
  const productIds = [...new Set(reviews.map((r: any) => r.productId?.toString()))];
  const products   = await (Product.find as any)({ _id: { $in: productIds } })
    .select('nameEn nameAr slug')
    .lean() as Array<{ _id: unknown; nameEn?: string; nameAr?: string; slug?: string }>;
  const productMap = Object.fromEntries(products.map((p: any) => [String(p._id), p]));

  const enriched = reviews.map((r: any) => ({
    ...r,
    product: productMap[r.productId?.toString()] ?? null,
  }));

  return ok({ reviews: enriched, pagination: { page, limit: safLimit, total, pages: Math.ceil(total / safLimit) } });
// V063 FIX-MED-05: Rate limit retained.
}, { rateMax: 10, rateWindow: 60 });
