// src/... — HemaV066: isAllowedImageUrl consolidated into lib/validators (MED-01)
// V037: productId ObjectId validation + GET rate limit 60/min
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB, Review, Product, Order } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody, getPagination, withDbRetry } from '@/lib/api';
import { requirePermission } from '@/lib/authz';
import { sanitize } from '@/lib/sanitize';
import { isAllowedImageUrl } from '@/lib/validators';

// GET /api/v1/reviews?productId=xxx
export const GET = withErrorHandler(async (req: NextRequest) => {
  await connectDB();
  const { page, limit, skip } = getPagination(req);
  const url       = new URL(req.url);
  const productId = url.searchParams.get('productId');

  if (!productId) return err('productId is required', 400);
  // VULN-06 FIX: validate productId format to prevent NoSQL injection / crash vectors
  if (!/^[a-f\d]{24}$/i.test(productId)) return err('Invalid productId', 400);

  const [reviews, total] = await Promise.all([
    (Review.find as any)({ productId, isApproved: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments({ productId, isApproved: true }),
  ]);

  return ok({ reviews, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}, { rateMax: 60, rateWindow: 60 }); // VULN-06 FIX: rate limit GET to 60 req/min per IP

const CreateReviewSchema = z.object({
  productId: z.string().min(1),
  rating:    z.number().int().min(1).max(5),
  // sanitize: strip any HTML/script tags from user-supplied text before storing
  title:     z.string().max(100).transform(v => sanitize(v)).optional(),
  body:      z.string().min(10, 'Review must be at least 10 characters').max(2000).transform(v => sanitize(v)),
  // VULN-03 FIX: restrict images to allowed domains only (Cloudinary etc.) — prevents SSRF
  images:    z.array(
    z.string()
      .url()
      .refine(isAllowedImageUrl, 'Image must be hosted on an allowed domain (Cloudinary, Unsplash, or Placehold)')
  ).max(5).optional(),
});

/** Minimal shape of a persisted Review document — enough for the post-create aggregation. */
interface ReviewDoc {
  productId: unknown;
  [key: string]: unknown;
}

// POST /api/v1/reviews
export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await requirePermission(req, 'write:review:own');
  if (!auth.ok) return auth.response;
  const session = auth.session;
  {
    const v = await validateBody(req, CreateReviewSchema);
    if ('error' in v) return v.error;

    await connectDB();
    const { productId, rating, title, body, images } = v.data;

    // Check if already reviewed
    const existing = await (Review.findOne as any)({ productId, userId: session!.user.id });
    if (existing) return err('You have already reviewed this product', 409);

    // V009 FIX: verified-purchase requires BOTH delivery AND successful payment.
    // Previous check accepted COD orders marked delivered even if paymentStatus
    // remained 'pending' (manual cash collection never confirmed) — yielding
    // false "Verified Purchase" badges for unpaid carts.
    const hasPurchased = await (Order.findOne as any)({
      userId: session!.user.id,
      'items.productId': productId,
      status: 'delivered',
      paymentStatus: 'paid',
    });

    // V061 FIX-D: withDbRetry wraps Review.create — review submission is write-heavy;
    // transient deadlocks must not surface as 500s. Idempotency: the existing-review
    // check above (findOne) means a retry cannot create duplicates.
    const review = await withDbRetry<ReviewDoc>('review:create', () => (Review.create as any)({
      productId,
      userId:             session!.user.id,
      userName:           sanitize(session!.user.name ?? ''),
      rating,
      title,
      body,
      images,
      isVerifiedPurchase: !!hasPurchased,
      // V027 FIX (High #1): disable auto-approval — all new reviews enter a
      // moderation queue (isApproved=false) and are only visible after an admin
      // approves them at /admin/reviews. This prevents spam, offensive content,
      // and fake reviews from appearing on product pages immediately.
      isApproved:         false,
    }));

    // Update product aggregate rating
    const stats = await Review.aggregate([
      { $match: { productId: review.productId, isApproved: true } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    const [firstStat] = stats;
    if (firstStat) {
      await withDbRetry('review:product-rating-update', () => (Product.findByIdAndUpdate as any)(productId, {
        rating:      Math.round(firstStat.avgRating * 10) / 10,
        reviewCount: firstStat.count,
      }));
    }

    return ok(review, 201);
  }
}, { rateMax: 20, rateWindow: 600 }); // V011: P2-05 — cap review POST at 10 per IP / 10 min
