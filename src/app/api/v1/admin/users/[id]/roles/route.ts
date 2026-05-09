// src/app/api/v1/admin/users/[id]/roles/route.ts — HemaV069
// CRIT-001 FIX (V069): Replaced requireRole() with requirePermission('change:role')
//   from the central authz.ts RBAC catalog. requireRole() bypassed the permission
//   catalog — any future RBAC change would not propagate to this route.
// V064 FIX-CRIT-03: Added rateMax:10/60s to POST handler.
//
// V055 NEW: POST /api/v1/admin/users/:id/roles
// Grants a role to a user.
// Requires change:role permission (maps to admin role via authz.ts).
//
// Body: { role: 'admin' | 'moderator' | 'user' }

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, err, withErrorHandler, validateBody, getIP, validateObjectId } from '@/lib/api';
import { requirePermission } from '@/lib/authz';
import { grantRole, RoleError, ROLES } from '@/lib/role.service';

type Ctx = { params: { id: string } };

const RoleBodySchema = z.object({
  role: z.enum(ROLES),
});

export const POST = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;

  const idErr = validateObjectId(params.id);
  if (idErr) return idErr;

  const authz = await requirePermission(req, 'change:role');
  if (!authz.ok) return authz.response;

  const v = await validateBody(req, RoleBodySchema);
  if ('error' in v) return v.error;

  try {
    await grantRole(params.id, v.data.role, {
      grantedBy: authz.session.user.id,
      ipAddress: getIP(req),
      userAgent: req.headers.get('user-agent') ?? undefined,
    });
    return ok({ message: `Role "${v.data.role}" granted to user ${params.id}` });
  } catch (e) {
    if (e instanceof RoleError) {
      return err(e.message, e.statusCode, e.code);
    }
    throw e;
  }
}, { rateMax: 10, rateWindow: 60 }); // CRIT-03 FIX (V064)
