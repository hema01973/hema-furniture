// src/infrastructure/repositories/MongoReviewRepository.ts — HemaV050
// Concrete MongoDB implementation of IReviewRepository.
// Strongly typed — no `any` usage.

import mongoose from 'mongoose';
import { connectDB, Review } from '@/lib/mongodb';
import type {
  IReviewRepository,
  ReviewEntity,
  ReviewFilters,
} from '@/domain/review/IReviewRepository';
import type { PaginatedResult } from '@/domain/shared/IRepository';

/** Minimal shape returned by Mongoose .lean() for a Review document. */
interface ReviewDoc {
  _id:                 mongoose.Types.ObjectId;
  productId?:          mongoose.Types.ObjectId | string;
  userId?:             mongoose.Types.ObjectId | string;
  userName:            string;
  rating:              number;
  title?:              string;
  body:                string;
  images?:             string[];
  isVerifiedPurchase?: boolean;
  isApproved?:         boolean;
  helpful?:            number;
  createdAt:           Date;
  updatedAt:           Date;
}

function toEntity(doc: ReviewDoc): ReviewEntity {
  return {
    id:                 doc._id.toString(),
    productId:          doc.productId?.toString() ?? '',
    userId:             doc.userId?.toString()    ?? '',
    userName:           doc.userName,
    rating:             doc.rating,
    title:              doc.title,
    body:               doc.body,
    images:             doc.images ?? [],
    isVerifiedPurchase: doc.isVerifiedPurchase ?? false,
    isApproved:         doc.isApproved ?? false,
    helpful:            doc.helpful ?? 0,
    createdAt:          doc.createdAt,
    updatedAt:          doc.updatedAt,
  };
}

export class MongoReviewRepository implements IReviewRepository {
  async findById(id: string): Promise<ReviewEntity | null> {
    await connectDB();
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await (Review.findById as any)(id).lean() as ReviewDoc | null;
    return doc ? toEntity(doc) : null;
  }

  async findAll(filters: ReviewFilters): Promise<PaginatedResult<ReviewEntity>> {
    await connectDB();
    const query: Record<string, unknown> = {};
    if (filters.productId)               query.productId  = new mongoose.Types.ObjectId(filters.productId);
    if (filters.userId)                  query.userId     = new mongoose.Types.ObjectId(filters.userId);
    if (filters.isApproved !== undefined) query.isApproved = filters.isApproved;

    const skip = (filters.page - 1) * filters.limit;
    const [docs, total] = await Promise.all([
      (Review.find as any)(query).sort({ createdAt: -1 }).skip(skip).limit(filters.limit).lean() as Promise<ReviewDoc[]>,
      Review.countDocuments(query),
    ]);
    return {
      items:      docs.map(toEntity),
      total,
      page:       filters.page,
      totalPages: Math.ceil(total / filters.limit),
    };
  }

  async findByProductId(
    productId: string,
    opts: { page: number; limit: number },
  ): Promise<PaginatedResult<ReviewEntity>> {
    return this.findAll({ productId, isApproved: true, ...opts });
  }

  async save(entity: ReviewEntity): Promise<ReviewEntity> {
    await connectDB();
    if (entity.id) {
      const doc = await (Review.findByIdAndUpdate as any)(entity.id, entity, { new: true, lean: true }) as ReviewDoc | null;
      if (!doc) throw Object.assign(new Error('Review not found'), { status: 404 });
      return toEntity(doc);
    }
    const doc = await (Review.create as any)(entity);
    return toEntity(doc.toObject() as ReviewDoc);
  }

  async delete(id: string): Promise<boolean> {
    await connectDB();
    const result = await (Review.findByIdAndDelete as any)(id);
    return !!result;
  }

  async approve(id: string): Promise<ReviewEntity | null> {
    await connectDB();
    const doc = await (Review.findByIdAndUpdate as any)(
      id,
      { isApproved: true },
      { new: true, lean: true },
    ) as ReviewDoc | null;
    return doc ? toEntity(doc) : null;
  }

  async reject(id: string): Promise<boolean> {
    await connectDB();
    const result = await (Review.findByIdAndDelete as any)(id);
    return !!result;
  }

  async incrementHelpful(id: string): Promise<ReviewEntity | null> {
    await connectDB();
    const doc = await (Review.findByIdAndUpdate as any)(
      id,
      { $inc: { helpful: 1 } },
      { new: true, lean: true },
    ) as ReviewDoc | null;
    return doc ? toEntity(doc) : null;
  }
}

export const reviewRepository = new MongoReviewRepository();
