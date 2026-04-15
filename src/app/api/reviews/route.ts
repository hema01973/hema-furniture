// src/app/api/reviews/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB, Review, Product, Order } from '@/lib/mongodb';
import { ok, err, withErrorHandler, withAuth, validateBody, getPagination } from '@/lib/api';

// GET /api/reviews?productId=xxx
export const GET = withErrorHandler(async (req: NextRequest) => {
  await connectDB();
  const { page, limit, skip } = getPagination(req);
  const url       = new URL(req.url);
  const productId = url.searchParams.get('productId');

  if (!productId) return err('productId is required', 400);

  const [reviews, total] = await Promise.all([
    Review.find({ productId, isApproved: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments({ productId, isApproved: true }),
  ]);

  return ok({ reviews, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const CreateReviewSchema = z.object({
  productId: z.string().min(1),
  rating:    z.number().int().min(1).max(5),
  title:     z.string().max(100).optional(),
  body:      z.string().min(10, 'Review must be at least 10 characters').max(2000),
  images:    z.array(z.string().url()).max(5).optional(),
});

// POST /api/reviews
export const POST = withErrorHandler(async (req: NextRequest) => {
  return withAuth(req, async (_req, session) => {
    const v = await validateBody(req, CreateReviewSchema);
    if ('error' in v) return v.error;

    await connectDB();
    const { productId, rating, title, body, images } = v.data;

    // Check if already reviewed
    const existing = await Review.findOne({ productId, userId: session!.user.id });
    if (existing) return err('You have already reviewed this product', 409);

    // Check if verified purchase
    const hasPurchased = await Order.findOne({
      userId: session!.user.id,
      'items.productId': productId,
      status: 'delivered',
    });

    const review = await Review.create({
      productId,
      userId:             session!.user.id,
      userName:           session!.user.name,
      rating,
      title,
      body,
      images,
      isVerifiedPurchase: !!hasPurchased,
      isApproved:         true, // auto-approve; set false for moderation
    });

    // Update product rating
    const stats = await Review.aggregate([
      { $match: { productId: review.productId, isApproved: true } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    if (stats.length) {
      await Product.findByIdAndUpdate(productId, {
        rating:      Math.round(stats[0].avgRating * 10) / 10,
        reviewCount: stats[0].count,
      });
    }

    return ok(review, 201);
  });
});
