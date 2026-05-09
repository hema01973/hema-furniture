// src/app/api/v1/admin/users/route.ts — HemaV068
// MED-001 FIX (V068): Replaced requireRole(req, 'admin') with requirePermission(req, 'read:user:any').
//   requireRole() is from a legacy module (lib/requireRole.ts) that bypasses the centralized
//   permission catalog in authz.ts. Any future role with read:user:any permission (e.g. support)
//   was silently denied access. Now aligned with the RBAC architecture — single source of truth.
// ARCH-002 FIX (V068): requireRole.ts is no longer imported by any route.
// V063 FIX-MED-04: Rate limit added — admin user list was unthrottled.
//
// GET /api/v1/admin/users — Lists all users with their roles (paginated).
//
// Query params:
//   page     — page number (default: 1)
//   pageSize — items per page (default: 20, max: 100)

import { NextRequest } from 'next/server';
import { ok, withErrorHandler } from '@/lib/api';
import { requirePermission } from '@/lib/authz';
import { listUsers } from '@/lib/role.service';

export const GET = withErrorHandler(async (req: NextRequest) => {
  // MED-001 FIX (V068): use centralized RBAC permission check
  const authz = await requirePermission(req, 'read:user:any');
  if (!authz.ok) return authz.response;

  const url = new URL(req.url);
  const page     = Math.max(1, parseInt(url.searchParams.get('page')     ?? '1',  10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10)));

  const result = await listUsers({ page, pageSize });
  return ok(result);
// V063 FIX-MED-04: Rate limit added — admin user list was unthrottled.
}, { rateMax: 30, rateWindow: 60 });
