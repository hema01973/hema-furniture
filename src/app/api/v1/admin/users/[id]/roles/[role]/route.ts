// src/app/api/v1/admin/users/[id]/roles/[role]/route.ts — HemaV069
// CRIT-001 FIX (V069): Replaced requireRole() with requirePermission('change:role')
//   from the central authz.ts RBAC catalog. requireRole() bypassed the permission
//   catalog — any future RBAC change would not propagate to this route.
// V064 FIX-CRIT-03: Added rateMax:10/60s to DELETE handler.
//
// V055 NEW: DELETE /api/v1/admin/users/:id/roles/:role
// Revokes a role from a user. Blocks self-demotion of admin role.
// Requires change:role permission (maps to admin role via authz.ts).

import { NextRequest } from 'next/server';
import { ok, err, withErrorHandler, getIP, validateObjectId } from '@/lib/api';
import { requirePermission } from '@/lib/authz';
import { removeRole, RoleError, ROLES } from '@/lib/role.service';

type Ctx = { params: { id: string; role: string } };

export const DELETE = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;

  const idErr = validateObjectId(params.id);
  if (idErr) return idErr;

  if (!(ROLES as readonly string[]).includes(params.role)) {
    return err(`Invalid role. Valid roles: ${ROLES.join(', ')}`, 422, 'INVALID_ROLE');
  }

  const authz = await requirePermission(req, 'change:role');
  if (!authz.ok) return authz.response;

  try {
    await removeRole(params.id, params.role, {
      removedBy: authz.session.user.id,
      ipAddress: getIP(req),
      userAgent: req.headers.get('user-agent') ?? undefined,
    });
    return ok({ message: `Role "${params.role}" revoked from user ${params.id}` });
  } catch (e) {
    if (e instanceof RoleError) {
      return err(e.message, e.statusCode, e.code);
    }
    throw e;
  }
}, { rateMax: 10, rateWindow: 60 }); // CRIT-03 FIX (V064)
