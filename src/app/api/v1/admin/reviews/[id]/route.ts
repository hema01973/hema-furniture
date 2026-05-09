// src/... — HemaV066: approve / reject a review
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB, Review, Product } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody, validateObjectId } from '@/lib/api';
import { requirePermission } from '@/lib/authz';

const PatchSchema = z.object({
  isApproved: z.boolean(),
});

// PATCH /api/v1/admin/reviews/[id]  { isApproved: boolean }
export const PATCH = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const auth = await requirePermission(req, 'delete:review:any');
  if (!auth.ok) return auth.response;

  const { params } = ctx as { params: { id: string } };
  // Hema033 FIX [HIGH-01]: validate ObjectId format before hitting MongoDB
  const idErr = validateObjectId(params.id);
  if (idErr) return idErr;
  const v = await validateBody(req, PatchSchema);
  if ('error' in v) return v.error;

  await connectDB();
  const review = await (Review.findByIdAndUpdate as any)(
    params.id,
    { $set: { isApproved: v.data.isApproved } },
    { new: true },
  );
  if (!review) return err('Review not found', 404);

  // Recalculate product aggregate rating (only approved reviews count)
  const stats = await Review.aggregate([
    { $match: { productId: review.productId, isApproved: true } },
    { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const [reviewStat] = stats;
  await (Product.findByIdAndUpdate as any)(review.productId, {
    rating:      reviewStat ? Math.round(reviewStat.avgRating * 10) / 10 : 0,
    reviewCount: reviewStat ? reviewStat.count : 0,
  });

  return ok(review);
}, { rateMax: 10, rateWindow: 60 }); // CRIT-03 FIX (V064)
