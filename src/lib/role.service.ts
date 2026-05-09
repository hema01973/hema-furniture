// src/lib/role.service.ts — HemaV055 feature port
//
// V055 NEW: Role management service — grant, revoke, list users with roles.
// Ported from V055 artifacts/api-server/src/services/role.service.ts
// and repositories/role.repository.ts, adapted for MongoDB + Mongoose.
//
// Key behaviors preserved from V055:
//   - Deny-by-default: users get 'user' role on registration (assignDefaultRole)
//   - Self-demotion of admin role is blocked
//   - All role changes are written to AuditLog
//   - assignRole is idempotent (no-op if role already exists)

import mongoose from 'mongoose';
import { connectDB, User, AuditLog } from './mongodb';
import { logger } from './logger';

export const ROLES = ['admin', 'moderator', 'user'] as const;
export type Role = (typeof ROLES)[number];

export interface UserWithRoles {
  _id: string;
  email: string;
  name: string;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
  roles: string[];
  createdAt: Date;
}

// ─── Role Repository (MongoDB) ────────────────────────────────────────────────

export async function getUserRoles(userId: string): Promise<string[]> {
  await connectDB();
  const user = await (User.findById as any)(userId).select('roles role').lean();
  if (!user) return [];
  // Prefer V055 roles array; fall back to legacy role field
  const doc = user as { roles?: string[]; role?: string };
  if (doc.roles && doc.roles.length > 0) return doc.roles;
  return doc.role ? [doc.role] : ['user'];
}

export async function assignRole(
  userId: string,
  role: string,
  grantedBy?: string,
): Promise<void> {
  await connectDB();
  // $addToSet is idempotent — no-op if role already exists (mirrors onConflictDoNothing)
  await (User.findByIdAndUpdate as any)(userId, { $addToSet: { roles: role } });
  logger.info('[RoleService] role assigned', { userId, role, grantedBy: grantedBy ?? 'system' });
}

export async function revokeRole(userId: string, role: string): Promise<boolean> {
  await connectDB();
  const result = await (User.findByIdAndUpdate as any)(
    userId,
    { $pull: { roles: role } },
    { new: true },
  );
  return !!result;
}

/** Shape returned by .lean() for the user listing query. */
type RawUserDoc = {
  _id: import('mongoose').Types.ObjectId;
  email: string;
  name?: string;
  isEmailVerified?: boolean;
  mfaEnabled?: boolean;
  roles?: string[];
  role?: string;
  createdAt: Date;
};

export async function listUsersWithRoles(opts: {
  limit: number;
  offset: number;
}): Promise<{ users: UserWithRoles[]; total: number }> {
  await connectDB();

  const [users, total] = await Promise.all([
    (User.find as any)()
      .select('email name isEmailVerified mfaEnabled roles role createdAt')
      .sort({ createdAt: 1 })
      .skip(opts.offset)
      .limit(opts.limit)
      .lean() as Promise<RawUserDoc[]>,
    User.countDocuments(),
  ]);

  const mapped: UserWithRoles[] = users.map((u: RawUserDoc) => {
    const doc = u;
    const roles =
      doc.roles && doc.roles.length > 0
        ? doc.roles
        : doc.role
          ? [doc.role]
          : ['user'];
    return {
      _id: doc._id.toString(),
      email: doc.email,
      name: doc.name ?? '',
      isEmailVerified: doc.isEmailVerified ?? false,
      mfaEnabled: doc.mfaEnabled ?? false,
      roles,
      createdAt: doc.createdAt,
    };
  });

  return { users: mapped, total };
}

// ─── Role Service ─────────────────────────────────────────────────────────────

export class RoleError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'RoleError';
  }
}

/**
 * V055: Assign default 'user' role on registration.
 * Called by auth routes immediately after user creation.
 */
export async function assignDefaultRole(userId: string): Promise<void> {
  await assignRole(userId, 'user');
}

/**
 * V055: Grant a role to a user.
 * Validates role, checks user exists, writes audit log.
 */
export async function grantRole(
  targetUserId: string,
  role: string,
  meta: { grantedBy: string; ipAddress?: string; userAgent?: string },
): Promise<void> {
  if (!(ROLES as readonly string[]).includes(role)) {
    throw new RoleError(
      `Invalid role "${role}". Valid roles: ${ROLES.join(', ')}`,
      'INVALID_ROLE',
      422,
    );
  }

  await connectDB();
  const target = await (User.findById as any)(targetUserId).lean();
  if (!target) throw new RoleError('User not found', 'USER_NOT_FOUND', 404);

  await assignRole(targetUserId, role, meta.grantedBy);

  await (AuditLog.create as any)({
    userId: meta.grantedBy,
    action: 'rbac.role.changed',
    resource: 'User',
    resourceId: targetUserId,
    details: { action: 'role_granted', role },
    ip: meta.ipAddress,
    userAgent: meta.userAgent,
  }).catch((e: unknown) =>
    logger.warn('[RoleService] audit log failed — grantRole', { error: String(e) }),
  );
}

/**
 * V055: Remove a role from a user.
 * Blocks self-demotion of the admin role.
 */
export async function removeRole(
  targetUserId: string,
  role: string,
  meta: { removedBy: string; ipAddress?: string; userAgent?: string },
): Promise<void> {
  if (!(ROLES as readonly string[]).includes(role)) {
    throw new RoleError(
      `Invalid role "${role}". Valid roles: ${ROLES.join(', ')}`,
      'INVALID_ROLE',
      422,
    );
  }

  // V055: self-demotion guard — admins cannot remove their own admin role
  if (role === 'admin' && meta.removedBy === targetUserId) {
    throw new RoleError(
      'Admins cannot remove their own admin role',
      'SELF_DEMOTION_FORBIDDEN',
      403,
    );
  }

  const removed = await revokeRole(targetUserId, role);
  if (!removed) {
    throw new RoleError(`User not found or role "${role}" not assigned`, 'ROLE_NOT_FOUND', 404);
  }

  await (AuditLog.create as any)({
    userId: meta.removedBy,
    action: 'rbac.role.changed',
    resource: 'User',
    resourceId: targetUserId,
    details: { action: 'role_revoked', role },
    ip: meta.ipAddress,
    userAgent: meta.userAgent,
  }).catch((e: unknown) =>
    logger.warn('[RoleService] audit log failed — removeRole', { error: String(e) }),
  );
}

/**
 * V055: List users with their roles (paginated).
 */
export async function listUsers(opts: {
  page: number;
  pageSize: number;
}): Promise<{ users: UserWithRoles[]; total: number; page: number; pageSize: number }> {
  const limit = Math.min(opts.pageSize, 100);
  const offset = (opts.page - 1) * limit;
  const { users, total } = await listUsersWithRoles({ limit, offset });
  return { users, total, page: opts.page, pageSize: limit };
}
