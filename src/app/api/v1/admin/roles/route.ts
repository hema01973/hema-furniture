// src/app/api/v1/admin/roles/route.ts — HemaV068
// ARCH-002 FIX (V068): Replaced requireRole(req, 'admin') with requirePermission(req, 'read:admin').
//   Aligns with the centralized RBAC architecture. requireRole.ts is now unused by all routes.
// V064 FIX-CRIT-03: Added rateMax:10/60s to GET handler.

import { NextRequest } from 'next/server';
import { ok, withErrorHandler } from '@/lib/api';
import { requirePermission } from '@/lib/authz';
import { ROLES } from '@/lib/role.service';

export const GET = withErrorHandler(async (req: NextRequest) => {
  // ARCH-002 FIX (V068): use centralized RBAC permission check
  const authz = await requirePermission(req, 'read:admin');
  if (!authz.ok) return authz.response;

  return ok({ roles: ROLES });
}, { rateMax: 10, rateWindow: 60 }); // CRIT-03 FIX (V064)
