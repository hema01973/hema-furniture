// src/app/api/v1/reviews/[id]/route.ts — HemaV066
// V064 FIX-CRIT-03: Added rateMax:20/60s to DELETE handler.
// V6.5: user can delete own review
import { NextRequest } from 'next/server';
import { connectDB, Review, Product } from '@/lib/mongodb';
import { ok, err, withErrorHandler } from '@/lib/api';
import { requireAnyPermission, hasPermission } from '@/lib/authz';

// DELETE /api/v1/reviews/[id]
export const DELETE = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  // V005: owner OR moderator. Owners use `write:review:own` (which they have
  // by default as customers); moderators use `delete:review:any`.
  const auth = await requireAnyPermission(req, ['delete:review:any', 'write:review:own']);
  if (!auth.ok) return auth.response;
  const session = auth.session;
  {
    const { params } = ctx as { params: { id: string } };
    await connectDB();

    const review = await (Review.findById as any)(params.id);
    if (!review) return err('Review not found', 404);

    const canDeleteAny = hasPermission(session.user.role as string, 'delete:review:any');
    const isOwner     = review.userId.toString() === session.user.id;
    if (!canDeleteAny && !isOwner) return err('Forbidden', 403);

    await review.deleteOne();

    // Recalculate product rating
    const stats = await Review.aggregate([
      { $match: { productId: review.productId, isApproved: true } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    const [reviewStat] = stats;
    await (Product.findByIdAndUpdate as any)(review.productId, {
      rating:      reviewStat ? Math.round(reviewStat.avgRating * 10) / 10 : 0,
      reviewCount: reviewStat ? reviewStat.count : 0,
    });

    return ok({ message: 'Review deleted' });
  }
}, { rateMax: 20, rateWindow: 60 }); // CRIT-03 FIX (V064)
