// src/... — HemaV050: password policy enforced
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB, User } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody } from '@/lib/api';
import { requirePermission } from '@/lib/authz';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { logger } from '@/lib/logger';

const Schema = z.object({
  currentPassword: z.string().min(1, 'Current password required').max(128),
  newPassword: z.string()
    .min(8,  'At least 8 characters')
    .max(128,'At most 128 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
});

// V010 (W2): unified RBAC — `auth:self` is held by every authenticated role.
export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await requirePermission(req, 'auth:self');
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const v = await validateBody(req, Schema);
  if ('error' in v) return v.error;

  await connectDB();
  // Fetch user only to verify current password — we do NOT call user.save()
  const user = await (User.findById as any)(session.user.id).select('+passwordHash');
  if (!user) return err('User not found', 404);

  const valid = await verifyPassword(v.data.currentPassword, user.passwordHash);
  if (!valid) return err('Current password is incorrect', 401, 'WRONG_PASSWORD');

  if (v.data.currentPassword === v.data.newPassword) {
    return err('New password must be different from current password', 400);
  }

  // V039 SECURITY FIX [HIGH-03]: increment permissionVersion to invalidate ALL
  // active sessions immediately. Without this, a stolen JWT remains valid for
  // the remainder of its 7-day lifetime even after the victim changes their
  // password. The BLOCKER-03 fix in auth.ts re-validates pv on every JWT refresh,
  // so bumping pv here forces an immediate session invalidation on all devices.
  const newHash = await hashPassword(v.data.newPassword);
  await (User.findByIdAndUpdate as any)(session.user.id, {
    passwordHash: newHash,
    failedLogins: 0,
    $inc: { permissionVersion: 1 },
  });

  logger.info('[Auth] Password changed — all sessions invalidated', { userId: session.user.id });
  return ok({ message: 'Password changed successfully' });
}, { failClosed: true, rateMax: 5, rateWindow: 900 }); // 5 attempts per 15 min
