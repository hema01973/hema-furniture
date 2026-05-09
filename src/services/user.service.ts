// src/services/user.service.ts — HemaV052
// Code quality fix: replaced all `as unknown as IUser` casts with a typed
// mapper function that explicitly bridges UserEntity → IUser. This surfaces
// any structural drift between the domain entity and the public type at
// compile time instead of silently producing wrong shapes at runtime.
import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/mongodb';
import { userRepository, orderRepository } from '@/infrastructure/repositories';
import { hashPassword } from '@/lib/auth';
import { sanitize, sanitizeEmail } from '@/lib/sanitize';
import { enqueueEmail } from '@/lib/queue';
import { logger } from '@/lib/logger';
import type { IUser } from '@/types';
import type { UserEntity } from '@/domain/user/IUserRepository';

// Explicit mapper — bridges the domain entity (id) to the legacy public type (_id).
// Any missing or renamed field will produce a compile error here rather than
// a silent runtime bug downstream.
function toIUser(e: UserEntity): IUser {
  return {
    _id:             e.id,
    name:            e.name,
    email:           e.email,
    phone:           e.phone,
    role:            e.role,
    avatar:          e.avatar,
    addresses:       e.addresses.map(a => ({
      _id:         a._id ?? '',
      label:       a.label,
      street:      a.street,
      city:        a.city,
      governorate: a.governorate,
      isDefault:   a.isDefault,
    })),
    wishlist:        e.wishlist,
    isEmailVerified: e.isEmailVerified,
    isActive:        e.isActive,
    mfaEnabled:      e.mfaEnabled,
    failedLogins:    e.failedLogins,
    lockedUntil:     e.lockedUntil,
    lastLoginAt:     e.lastLoginAt,
    createdAt:       e.createdAt,
  };
}

export interface UserUpdateInput {
  name?:  string;
  phone?: string;
  avatar?: string;
  addresses?: Array<{
    _id?: string; label: string; street: string;
    city: string; governorate: string; isDefault: boolean;
  }>;
}

export async function getUserById(id: string): Promise<IUser | null> {
  const entity = await userRepository.findById(id);
  return entity ? toIUser(entity) : null;
}

export async function updateUser(id: string, input: UserUpdateInput): Promise<IUser> {
  const existing = await userRepository.findById(id);
  if (!existing) throw Object.assign(new Error('User not found'), { status: 404 });

  const updated = await userRepository.save({
    ...existing,
    ...(input.name      ? { name:      sanitize(input.name) }   : {}),
    ...(input.phone     ? { phone:     sanitize(input.phone) }  : {}),
    ...(input.avatar    ? { avatar:    input.avatar }            : {}),
    ...(input.addresses ? { addresses: input.addresses }        : {}),
  });

  logger.info('[UserService] Profile updated', { userId: id });
  return toIUser(updated);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const cleanEmail = sanitizeEmail(email);
  const entity     = await userRepository.findByEmail(cleanEmail);
  if (!entity || !entity.isActive) return;

  const rawToken  = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 3600_000);

  await userRepository.setPasswordReset(entity.id, tokenHash, expiresAt);

  enqueueEmail({ type: 'passwordReset', email: cleanEmail, token: rawToken }).catch(() => {});
  logger.info('[UserService] Password reset requested', { userId: entity.id });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const entity    = await userRepository.findByPasswordResetToken(tokenHash);

  if (!entity) throw Object.assign(new Error('Reset link is invalid or has expired'), { status: 400 });

  const newHash = await hashPassword(newPassword);
  await userRepository.clearPasswordReset(entity.id, newHash);

  logger.info('[UserService] Password reset completed', { userId: entity.id });
}

export async function toggleWishlist(userId: string, productId: string): Promise<{ added: boolean }> {
  return userRepository.toggleWishlist(userId, productId);
}

export async function getUserOrderStats(userId: string) {
  await connectDB();
  // Aggregate via orderRepository — uses Order model internally
  const { Order } = await import('@/lib/mongodb');
  const stats = await Order.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $group: {
      _id:    null,
      total:  { $sum: '$total' },
      count:  { $sum: 1 },
      avgOrder: { $avg: '$total' },
    }},
  ]);
  return stats[0] ?? { total: 0, count: 0, avgOrder: 0 };
}
