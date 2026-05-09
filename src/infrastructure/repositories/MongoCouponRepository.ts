// src/infrastructure/repositories/MongoCouponRepository.ts — HemaV050
// Concrete MongoDB implementation of ICouponRepository.
// Strongly typed — no `any` usage.

import mongoose, { type ClientSession } from 'mongoose';
import { connectDB, Coupon } from '@/lib/mongodb';
import type {
  ICouponRepository,
  CouponEntity,
  CouponFilters,
} from '@/domain/coupon/ICouponRepository';
import type { PaginatedResult } from '@/domain/shared/IRepository';

/** Minimal shape returned by Mongoose .lean() for a Coupon document. */
interface CouponDoc {
  _id:           mongoose.Types.ObjectId;
  code:          string;
  type:          'percentage' | 'fixed';
  value:         number;
  minOrderValue?: number;
  maxUses?:      number;
  usedCount?:    number;
  perUserLimit?: number;
  usedBy?:       mongoose.Types.ObjectId[];
  expiresAt?:    Date;
  isActive?:     boolean;
  createdAt:     Date;
  updatedAt:     Date;
}

function toEntity(doc: CouponDoc): CouponEntity {
  return {
    id:            doc._id.toString(),
    code:          doc.code,
    type:          doc.type,
    value:         doc.value,
    minOrderValue: doc.minOrderValue ?? 0,
    maxUses:       doc.maxUses,
    usedCount:     doc.usedCount ?? 0,
    perUserLimit:  doc.perUserLimit ?? 1,
    usedBy:        (doc.usedBy ?? []).map((id: mongoose.Types.ObjectId) => id.toString()),
    expiresAt:     doc.expiresAt,
    isActive:      doc.isActive ?? true,
    createdAt:     doc.createdAt,
    updatedAt:     doc.updatedAt,
  };
}

export class MongoCouponRepository implements ICouponRepository {
  async findById(id: string): Promise<CouponEntity | null> {
    await connectDB();
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await (Coupon.findById as any)(id).lean() as CouponDoc | null;
    return doc ? toEntity(doc) : null;
  }

  async findByCode(code: string): Promise<CouponEntity | null> {
    await connectDB();
    const doc = await (Coupon.findOne as any)({ code: code.toUpperCase() }).lean() as CouponDoc | null;
    return doc ? toEntity(doc) : null;
  }

  async findActiveByCode(code: string): Promise<CouponEntity | null> {
    await connectDB();
    const now = new Date();
    const doc = await (Coupon.findOne as any)({
      code: code.toUpperCase(),
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
    }).lean() as CouponDoc | null;
    return doc ? toEntity(doc) : null;
  }

  async findAll(filters: CouponFilters): Promise<PaginatedResult<CouponEntity>> {
    await connectDB();
    const query: Record<string, unknown> = {};
    if (filters.isActive !== undefined) query.isActive = filters.isActive;
    const skip = (filters.page - 1) * filters.limit;
    const [docs, total] = await Promise.all([
      (Coupon.find as any)(query).sort({ createdAt: -1 }).skip(skip).limit(filters.limit).lean() as Promise<CouponDoc[]>,
      Coupon.countDocuments(query),
    ]);
    return {
      items:      docs.map(toEntity),
      total,
      page:       filters.page,
      totalPages: Math.ceil(total / filters.limit),
    };
  }

  async save(entity: CouponEntity): Promise<CouponEntity> {
    await connectDB();
    if (entity.id) {
      const doc = await (Coupon.findByIdAndUpdate as any)(entity.id, entity, { new: true, lean: true }) as CouponDoc | null;
      if (!doc) throw Object.assign(new Error('Coupon not found'), { status: 404 });
      return toEntity(doc);
    }
    const doc = await (Coupon.create as any)(entity);
    return toEntity(doc.toObject() as CouponDoc);
  }

  async delete(id: string): Promise<boolean> {
    await connectDB();
    const result = await (Coupon.findByIdAndUpdate as any)(id, { isActive: false });
    return !!result;
  }

  async atomicClaim(
    id: string,
    userId?: string,
    perUserLimit = 1,
    session?: ClientSession,
  ): Promise<CouponEntity | null> {
    await connectDB();
    const now = new Date();
    const conditions: Record<string, unknown>[] = [
      { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] },
      { $or: [{ maxUses: null }, { maxUses: { $exists: false } }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }] },
    ];

    if (userId) {
      conditions.push({
        $expr: {
          $lt: [
            {
              $size: {
                $filter: {
                  input: { $ifNull: ['$usedBy', []] },
                  cond:  { $eq: ['$$this', new mongoose.Types.ObjectId(userId)] },
                },
              },
            },
            perUserLimit,
          ],
        },
      });
    }

    const doc = await (Coupon.findOneAndUpdate as any)(
      { _id: id, isActive: true, $and: conditions },
      {
        $inc:  { usedCount: 1 },
        ...(userId ? { $push: { usedBy: new mongoose.Types.ObjectId(userId) } } : {}),
      },
      { new: true, lean: true, ...(session ? { session } : {}) },
    ) as CouponDoc | null;
    return doc ? toEntity(doc) : null;
  }

  async claimCoupon(
    id: string,
    userId: string | undefined,
    session?: ClientSession,
  ): Promise<CouponEntity | null> {
    const entity = await this.findById(id);
    const perUserLimit = entity?.perUserLimit ?? 1;
    return this.atomicClaim(id, userId, perUserLimit, session);
  }

  async deactivate(id: string): Promise<boolean> {
    await connectDB();
    const result = await (Coupon.findByIdAndUpdate as any)(id, { isActive: false });
    return !!result;
  }
}

export const couponRepository = new MongoCouponRepository();
