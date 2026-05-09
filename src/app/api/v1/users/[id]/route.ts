// src/app/api/v1/users/[id]/route.ts — HemaV066
// CRIT-01 FIX (V066): User DELETE now cascades — orphaned orders, reviews, and audit logs
//   are anonymised/deleted inside a Mongoose multi-document transaction. GDPR Art.17 compliant.
// HIGH-01 FIX (V066): ok() second arg was an options object { rateMax, rateWindow } — runtime
//   sent status '[object Object]'. Fixed: ok() called with no second arg; rate limit stays in
//   withErrorHandler options where it belongs.
// V064 FIX-CRIT-03: Added rateMax:10/60s to all handlers (GET/PUT/PATCH/DELETE).
import { NextRequest } from 'next/server';
import mongoose        from 'mongoose';
import { z } from 'zod';
import { connectDB, User, Order, Review, AuditLog } from '@/lib/mongodb';
import { getIP } from '@/lib/api';
import { ok, err, withErrorHandler, validateBody, validateObjectId } from '@/lib/api';
import { requirePermission, requireAnyPermission, requireOwnership, hasPermission } from '@/lib/authz';
import { sanitize } from '@/lib/sanitize';
import { logger }   from '@/lib/logger';

type Ctx = { params: { id: string } };

// GET /api/users/:id
export const GET = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  const idErr = validateObjectId(params.id);
  if (idErr) return idErr;
  const auth = await requireAnyPermission(req, ['read:user:any', 'read:user:own']);
  if (!auth.ok) return auth.response;
  const canSeeAny = hasPermission(auth.session.user.role as string, 'read:user:any');
  const id = canSeeAny ? params.id : auth.session.user.id;
  await connectDB();
  const user = await (User.findById as any)(id).select('-passwordHash -emailVerificationToken -passwordResetToken').lean();
  if (!user) return err('User not found', 404);
  return ok(user);
}, { rateMax: 10, rateWindow: 60 });

// V005: Schema is allow-list — `role` and `permissions` are NOT listed, so a
// customer cannot escalate their own role through PUT.
const UpdateSchema = z.object({
  name:  z.string().min(2).max(100).transform(v => sanitize(v)).optional(),
  phone: z.string().max(30).regex(/^[+\d\s\-()]*$/, 'Invalid phone format').optional(),
  addresses: z.array(z.object({
    label: z.string(), street: z.string(), city: z.string(), governorate: z.string(),
    isDefault: z.boolean().optional(),
  })).optional(),
});

// PUT /api/users/:id
export const PUT = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  const idErr = validateObjectId(params.id);
  if (idErr) return idErr;
  const auth = await requireAnyPermission(req, ['read:user:any', 'write:user:own']);
  if (!auth.ok) return auth.response;
  const own = requireOwnership(auth.session, params.id, 'read:user:any');
  if (own) return own;
  const v = await validateBody(req, UpdateSchema);
  if ('error' in v) return v.error;
  await connectDB();
  const user = await (User.findByIdAndUpdate as any)(params.id, v.data, { new: true }).select('-passwordHash');
  if (!user) return err('User not found', 404);
  return ok(user);
}, { rateMax: 10, rateWindow: 60 });

const PatchSchema = z.object({
  action: z.enum(['block', 'unblock']),
});

// PATCH /api/v1/users/:id  (admin only — block / unblock)
export const PATCH = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  const idErr = validateObjectId(params.id);
  if (idErr) return idErr;
  const auth = await requirePermission(req, 'block:user');
  if (!auth.ok) return auth.response;
  const session = auth.session;
  const v = await validateBody(req, PatchSchema);
  if ('error' in v) return v.error;
  if (params.id === session.user.id && v.data.action === 'block') {
    return err('You cannot block your own account', 400, 'SELF_BLOCK');
  }
  await connectDB();
  const user = await (User.findByIdAndUpdate as any)(
    params.id,
    { isActive: v.data.action === 'unblock' },
    { new: true },
  ).select('-passwordHash');
  if (!user) return err('User not found', 404);
  (AuditLog.create as any)({
    userId:     session.user.id,
    action:     `user.${v.data.action}`,
    resource:   'User',
    resourceId: params.id,
    ip:         getIP(req),
  }).catch((e: unknown) => logger.warn('[AuditLog] create failed — user block/unblock', { error: String(e) }));
  return ok(user);
}, { rateMax: 10, rateWindow: 60 });

// DELETE /api/users/:id  (admin only)
// CRIT-01 FIX (V066): Full cascade inside a Mongoose session/transaction.
//   - Orders: userId anonymised to '[deleted]' (retained for accounting/GDPR Art.17(3)(b))
//   - Reviews: hard-deleted (personal opinion content — no retention obligation)
//   - AuditLog: userId anonymised to '[deleted]' (audit chain must be retained for compliance)
//   - Wishlist: cleared via $set on User document (embedded array, covered by User delete)
// Soft-delete pattern not used — admin DELETE is an explicit GDPR erasure request.
export const DELETE = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  const idErr = validateObjectId(params.id);
  if (idErr) return idErr;
  const auth = await requirePermission(req, 'delete:user');
  if (!auth.ok) return auth.response;
  const session = auth.session;
  if (params.id === session.user.id) {
    return err('You cannot delete your own account', 400, 'SELF_DELETE');
  }
  await connectDB();

  // Verify user exists before starting transaction
  const userToDelete = await (User.findById as any)(params.id).lean();
  if (!userToDelete) return err('User not found', 404);

  // CRIT-01 FIX: Multi-document transaction — all-or-nothing cascade
  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();
  try {
    // 1. Delete the user document
    await (User.findByIdAndDelete as any)(params.id, { session: dbSession });

    // 2. Anonymise orders — retain for accounting but remove PII link
    await Order.updateMany(
      { userId: params.id },
      { $set: { userId: '[deleted]' } },
      { session: dbSession },
    );

    // 3. Hard-delete reviews — personal opinion, no retention obligation
    await Review.deleteMany({ userId: params.id }, { session: dbSession });

    // 4. Anonymise audit log entries — audit chain must be retained for compliance
    await AuditLog.updateMany(
      { userId: params.id },
      { $set: { userId: '[deleted]' } },
      { session: dbSession },
    );

    await dbSession.commitTransaction();
  } catch (txErr) {
    await dbSession.abortTransaction();
    logger.error('[User.DELETE] Transaction aborted — cascade failed', { error: String(txErr) });
    throw txErr;
  } finally {
    dbSession.endSession();
  }

  // Audit the deletion itself (fire-and-forget, after transaction committed)
  (AuditLog.create as any)({
    userId:     session.user.id,
    action:     'user.delete',
    resource:   'User',
    resourceId: params.id,
    details:    { deletedRole: (userToDelete as { role?: string }).role },
    ip:         getIP(req),
  }).catch((e: unknown) => logger.warn('[AuditLog] create failed — user.delete', { error: String(e) }));

  // HIGH-01 FIX (V066): ok() called with correct signature — no options object as second arg.
  return ok({ message: 'User deleted' });
}, { rateMax: 10, rateWindow: 60 });
