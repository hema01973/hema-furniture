// src/app/api/v1/users/route.ts — HemaV066
// LOW-02 FIX (V066): Cursor-based pagination added (same pattern as orders/audit-logs).
//   Skip/limit was O(N) at scale — MongoDB scans all preceding documents.
//   Cursor pagination uses indexed _id field — O(1) cost at any page depth.
// V063 FIX-MED-06: Normalize 'staff' → 'manager' role alias for consistent DB filtering.
// V050: ReDoS fix, role validation, escaped regex
import { NextRequest } from 'next/server';
import { z }           from 'zod';
import { connectDB, User } from '@/lib/mongodb';
import { ok, withErrorHandler, getPagination, getCursorPagination } from '@/lib/api';
import { requirePermission } from '@/lib/authz';

// V005: extended to include the new RBAC tiers.
const VALID_ROLES = new Set(['customer', 'admin', 'staff', 'manager', 'support']);

const MAX_USERS_LIMIT = 50;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const QuerySchema = z.object({
  q:    z.string().max(100).optional(),
  role: z.string().max(20).optional(),
});

// GET /api/v1/users  (requires `read:user:any`)
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await requirePermission(req, 'read:user:any');
  if (!auth.ok) return auth.response;

  await connectDB();
  const url = new URL(req.url);

  const parsed = QuerySchema.safeParse({
    q:    url.searchParams.get('q'),
    role: url.searchParams.get('role'),
  });
  if (!parsed.success) {
    return (await import('@/lib/api')).err('Invalid query parameters', 422, 'VALIDATION');
  }

  const { q, role } = parsed.data;
  const filter: Record<string, unknown> = {};

  // V063 FIX-MED-06: Normalize 'staff' → 'manager' for consistent DB filtering.
  if (role && VALID_ROLES.has(role)) {
    const normalizedRole = role === 'staff' ? 'manager' : role;
    filter.role = normalizedRole === 'manager'
      ? { $in: ['manager', 'staff'] }
      : normalizedRole;
  }

  if (q && q.trim().length >= 2) {
    const safe = escapeRegex(q.trim());
    filter.$or = [
      { name:  { $regex: safe, $options: 'i' } },
      { email: { $regex: safe, $options: 'i' } },
    ];
  }

  // LOW-02 FIX (V066): Cursor-based pagination when 'cursor' param is present.
  // Uses indexed _id field — O(1) at any depth. Backward-compatible: falls back
  // to skip/limit when 'cursor' is absent (existing admin UI keeps working).
  if (url.searchParams.has('cursor')) {
    const { cursorFilter, limit: rawLimit, cursor } = getCursorPagination(req);
    const limit  = Math.min(rawLimit, MAX_USERS_LIMIT);
    const items  = await (User.find as any)({ ...filter, ...cursorFilter })
      .select('-passwordHash -emailVerificationToken -passwordResetToken -mfaSecret -mfaBackupCodes')
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    const hasMore    = items.length > limit;
    const pageItems  = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? String(pageItems.at(-1)?._id) : null;
    return ok({ items: pageItems, nextCursor, hasPreviousPage: Boolean(cursor) });
  }

  // Backward-compatible skip/limit pagination
  const { page, limit: rawLimit, skip } = getPagination(req);
  const limit = Math.min(rawLimit, MAX_USERS_LIMIT);

  const [users, total] = await Promise.all([
    (User.find as any)(filter)
      .select('-passwordHash -emailVerificationToken -passwordResetToken -mfaSecret -mfaBackupCodes')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return ok({ users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}, { rateMax: 10, rateWindow: 60 });
