// src/... — HemaV066: permission-based access (read:analytics)
import { NextRequest } from 'next/server';
import { ok, withErrorHandler } from '@/lib/api';
import { requirePermission } from '@/lib/authz';
import { getDashboardStats } from '@/services/analytics.service';

// V011: P2-04 — explicit cap (60 req / 60 s per IP). Each call fans out into
// several heavy aggregations against Mongo; without an explicit limit a
// logged-in admin client polling at 1 Hz could pin a replica under load.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await requirePermission(req, 'read:analytics');
  if (!auth.ok) return auth.response;
  const stats = await getDashboardStats();
  return ok(stats);
}, { rateMax: 20, rateWindow: 60 });
