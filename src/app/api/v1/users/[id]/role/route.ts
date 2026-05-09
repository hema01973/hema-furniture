// src/... — HemaV066: role assignment with escalation guard
// V014 FIX: Dedicated endpoint for role changes — increments permissionVersion
// so the JWT pv check in middleware immediately invalidates the user's active
// sessions without waiting for the 7-day JWT expiry.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB, User, AuditLog } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody, getIP, validateObjectId, withDbRetry } from '@/lib/api';
import { requirePermission, assertCanAssignRole } from '@/lib/authz';
import { logger } from '@/lib/logger';

type Ctx = { params: { id: string } };

const RoleSchema = z.object({
  role: z.enum(['customer', 'admin', 'staff', 'manager', 'support']),
});

// PATCH /api/v1/users/:id/role  (admin only — change role)
export const PATCH = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  // Hema033 FIX [HIGH-01]: validate ObjectId format before hitting MongoDB
  const idErr = validateObjectId(params.id);
  if (idErr) return idErr;
  const auth = await requirePermission(req, 'change:role');
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const v = await validateBody(req, RoleSchema);
  if ('error' in v) return v.error;

  // Guard: privilege escalation check
  const guard = assertCanAssignRole(session, params.id, v.data.role);
  if (guard) return guard;

  await connectDB();
  // V061 FIX-D: withDbRetry for role change — permission version increment is
  // write-heavy and must not permanently fail on transient deadlock/network drop.
  const user = await withDbRetry('user:role-change', () => (User.findByIdAndUpdate as any)(
    params.id,
    {
      role: v.data.role,
      // V014 FIX: increment permissionVersion so the next request from this
      // user fails the pv check in middleware → session invalidated immediately.
      $inc: { permissionVersion: 1 },
    },
    { new: true },
  ).select('-passwordHash'));

  if (!user) return err('User not found', 404);

  logger.info('[Users] Role changed', {
    actor: session.user.id, target: params.id, newRole: v.data.role,
  });

  (AuditLog.create as any)({
    userId:     session.user.id,
    action:     'user.role.change',
    resource:   'User',
    resourceId: params.id,
    details:    { newRole: v.data.role },
    ip:         getIP(req),
  }).catch((e: unknown) => logger.warn('[AuditLog] create failed — role change', { error: String(e) }));

  return ok(user);
}, { rateMax: 10, rateWindow: 60 }); // CRIT-03 FIX (V064)
