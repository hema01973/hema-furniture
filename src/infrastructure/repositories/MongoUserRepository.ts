// src/infrastructure/repositories/MongoUserRepository.ts — HemaV050
// Concrete MongoDB implementation of IUserRepository.
// Strongly typed — no `any` usage.

import mongoose from 'mongoose';
import { connectDB, User } from '@/lib/mongodb';
import type {
  IUserRepository,
  UserEntity,
  UserFilters,
  AddressEntry,
} from '@/domain/user/IUserRepository';
import type { PaginatedResult } from '@/domain/shared/IRepository';
import type { UserRole } from '@/types';

/** Minimal shape returned by Mongoose .lean() for a User document. */
interface UserDoc {
  _id:              mongoose.Types.ObjectId;
  name:             string;
  email:            string;
  phone?:           string;
  role:             UserRole;
  avatar?:          string;
  addresses?:       AddressDoc[];
  wishlist?:        (mongoose.Types.ObjectId | string)[];
  isEmailVerified?: boolean;
  isActive?:        boolean;
  mfaEnabled?:      boolean;
  failedLogins?:    number;
  lockedUntil?:     Date;
  lastLoginAt?:     Date;
  createdAt:        Date;
  updatedAt:        Date;
}

interface AddressDoc {
  _id?:        mongoose.Types.ObjectId | string;
  label:       string;
  street:      string;
  city:        string;
  governorate: string;
  isDefault:   boolean;
}

function toEntity(doc: UserDoc): UserEntity {
  return {
    id:              doc._id.toString(),
    name:            doc.name,
    email:           doc.email,
    phone:           doc.phone,
    role:            doc.role,
    avatar:          doc.avatar,
    addresses:       (doc.addresses ?? []).map((a: AddressDoc): AddressEntry => ({
      _id:         a._id?.toString(),
      label:       a.label,
      street:      a.street,
      city:        a.city,
      governorate: a.governorate,
      isDefault:   a.isDefault,
    })),
    wishlist:        (doc.wishlist ?? []).map((id: mongoose.Types.ObjectId | string) => id.toString()),
    isEmailVerified: doc.isEmailVerified ?? false,
    isActive:        doc.isActive ?? true,
    mfaEnabled:      doc.mfaEnabled ?? false,
    failedLogins:    doc.failedLogins ?? 0,
    lockedUntil:     doc.lockedUntil,
    lastLoginAt:     doc.lastLoginAt,
    createdAt:       doc.createdAt,
    updatedAt:       doc.updatedAt,
  };
}

export class MongoUserRepository implements IUserRepository {
  async findById(id: string): Promise<UserEntity | null> {
    await connectDB();
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await (User.findById as any)(id).lean() as UserDoc | null;
    return doc ? toEntity(doc) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    await connectDB();
    const doc = await (User.findOne as any)({ email: email.toLowerCase().trim() }).lean() as UserDoc | null;
    return doc ? toEntity(doc) : null;
  }

  async findAll(filters: UserFilters): Promise<PaginatedResult<UserEntity>> {
    await connectDB();
    const query: Record<string, unknown> = {};
    if (filters.role) query.role = filters.role;
    if (filters.search) {
      const re = new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ name: re }, { email: re }];
    }
    const skip = (filters.page - 1) * filters.limit;
    const [docs, total] = await Promise.all([
      (User.find as any)(query).sort({ createdAt: -1 }).skip(skip).limit(filters.limit).lean() as Promise<UserDoc[]>,
      User.countDocuments(query),
    ]);
    return {
      items:      docs.map(toEntity),
      total,
      page:       filters.page,
      totalPages: Math.ceil(total / filters.limit),
    };
  }

  async save(entity: UserEntity): Promise<UserEntity> {
    await connectDB();
    if (entity.id) {
      // HIGH-004 FIX (V069): Use explicit $set with a whitelist of user-modifiable fields.
      // Previously passing `entity` directly allowed any field (role, isActive, failedLogins)
      // to be updated if the entity contained them — even from user-facing endpoints.
      // System-controlled fields (role, isActive, failedLogins, lockedUntil, mfaEnabled)
      // must only be updated via dedicated repository methods (updateRole, lockUntil, etc.).
      const allowedUpdate = {
        name:      entity.name,
        phone:     entity.phone,
        avatar:    entity.avatar,
        addresses: entity.addresses,
        // wishlist is managed via toggleWishlist — not settable via save()
      };
      const doc = await (User.findByIdAndUpdate as any)(
        entity.id,
        { $set: allowedUpdate },
        { new: true, lean: true },
      ) as UserDoc | null;
      if (!doc) throw Object.assign(new Error('User not found'), { status: 404 });
      return toEntity(doc);
    }
    const doc = await (User.create as any)(entity);
    return toEntity(doc.toObject() as UserDoc);
  }

  async delete(id: string): Promise<boolean> {
    await connectDB();
    const result = await (User.findByIdAndUpdate as any)(id, { isActive: false });
    return !!result;
  }

  async updateRole(id: string, role: UserRole): Promise<UserEntity | null> {
    await connectDB();
    const doc = await (User.findByIdAndUpdate as any)(id, { role }, { new: true, lean: true }) as UserDoc | null;
    return doc ? toEntity(doc) : null;
  }

  async toggleWishlist(id: string, productId: string): Promise<{ added: boolean }> {
    await connectDB();
    const user = await (User.findById as any)(id).select('wishlist');
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

    const wishlist = (user.wishlist ?? []) as (mongoose.Types.ObjectId | string)[];
    const present  = wishlist.some(wid => wid.toString() === productId);
    if (present) {
      await (User.findByIdAndUpdate as any)(id, { $pull: { wishlist: productId } });
      return { added: false };
    } else {
      await (User.findByIdAndUpdate as any)(id, { $addToSet: { wishlist: productId } });
      return { added: true };
    }
  }

  async setPasswordReset(id: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await connectDB();
    await (User.findByIdAndUpdate as any)(id, {
      passwordResetToken:   tokenHash,
      passwordResetExpires: expiresAt,
    });
  }

  async findByPasswordResetToken(tokenHash: string): Promise<UserEntity | null> {
    await connectDB();
    const doc = await (User.findOne as any)({
      passwordResetToken:   tokenHash,
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordHash +passwordResetToken +passwordResetExpires').lean() as UserDoc | null;
    return doc ? toEntity(doc) : null;
  }

  async clearPasswordReset(id: string, newPasswordHash: string): Promise<void> {
    await connectDB();
    await (User.findByIdAndUpdate as any)(id, {
      passwordHash:         newPasswordHash,
      passwordResetToken:   null,
      passwordResetExpires: null,
      failedLogins:         0,
      lockedUntil:          null,
    });
  }

  async incrementFailedLogins(id: string): Promise<number> {
    await connectDB();
    const doc = await (User.findByIdAndUpdate as any)(
      id,
      { $inc: { failedLogins: 1 } },
      { new: true, lean: true },
    ) as (UserDoc & { failedLogins: number }) | null;
    return doc?.failedLogins ?? 0;
  }

  async lockUntil(id: string, until: Date): Promise<void> {
    await connectDB();
    await (User.findByIdAndUpdate as any)(id, { lockedUntil: until });
  }

  async resetFailedLogins(id: string): Promise<void> {
    await connectDB();
    await (User.findByIdAndUpdate as any)(id, { failedLogins: 0, lockedUntil: null });
  }
}

export const userRepository = new MongoUserRepository();
