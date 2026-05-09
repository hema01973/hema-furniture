// src/app/api/v1/admin/audit-logs/route.ts — HemaV066
// HIGH-02 FIX (V066): Date params now validated with isNaN check — prevents NaN injection into MongoDB.
// V063 FIX-MED-05: Rate limit added — endpoint performs DB scan with no throttle.
// LOW-02 FIX (V062): Cursor-based pagination added.
// MED-01 FIX (V054): requirePermission result is now checked — auth bypass closed.
// MED-02 FIX (V054): escapeRegex() applied before $regex — ReDoS prevented.
// ARCH-02 FIX (V054): limit capped at MAX_LIMIT=100 to prevent DB overload.

import { NextRequest }               from 'next/server';
import { ok, withErrorHandler, getPagination, getCursorPagination } from '@/lib/api';
import { requirePermission }         from '@/lib/authz';
import { connectDB, AuditLog }       from '@/lib/mongodb';
import { sanitize }                  from '@/lib/sanitize';

const MAX_AUDIT_LIMIT = 100;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authz = await requirePermission(req, 'read:audit');
  if (!authz.ok) return authz.response;
  await connectDB();

  const url     = new URL(req.url);
  const action  = sanitize(url.searchParams.get('action')  ?? '');
  const userId  = sanitize(url.searchParams.get('userId')  ?? '');
  const from    = url.searchParams.get('from');
  const to      = url.searchParams.get('to');

  const query: Record<string, unknown> = {};
  if (action)  query.action = { $regex: escapeRegex(action), $options: 'i' };
  if (userId)  query.userId = userId;
  if (from || to) {
    // HIGH-02 FIX (V066): Validate date strings before use — new Date('notadate') produces
    // Invalid Date which Mongoose serialises as NaN in $gte/$lte, causing full-collection scan.
    const fromDate = from ? new Date(from) : null;
    const toDate   = to   ? new Date(to)   : null;
    if (fromDate && isNaN(fromDate.getTime())) {
      return (await import('@/lib/api')).err('Invalid "from" date format', 422, 'VALIDATION');
    }
    if (toDate && isNaN(toDate.getTime())) {
      return (await import('@/lib/api')).err('Invalid "to" date format', 422, 'VALIDATION');
    }
    query.createdAt = {} as Record<string, Date>;
    if (fromDate) (query.createdAt as Record<string, Date>).$gte = fromDate;
    if (toDate)   (query.createdAt as Record<string, Date>).$lte = toDate;
  }

  // LOW-02 FIX (V062): Cursor pagination when 'cursor' param present.
  // Uses indexed _id field — O(1) cost at any page depth.
  if (url.searchParams.has('cursor')) {
    const { cursorFilter, limit: rawLimit, cursor } = getCursorPagination(req);
    const limit  = Math.min(rawLimit, MAX_AUDIT_LIMIT);
    const filter = { ...query, ...cursorFilter };
    const items  = await (AuditLog.find as any)(filter).sort({ _id: -1 }).limit(limit + 1).lean();
    const hasMore    = items.length > limit;
    const pageItems  = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? String(pageItems.at(-1)?._id) : null;
    return ok({ items: pageItems, nextCursor, hasPreviousPage: Boolean(cursor) });
  }

  // ADV-03 FIX (V067): Removed countDocuments() — it forces a full collection scan on
  // large audit logs (O(N)) and can be exploited as a timing oracle. Response now uses
  // cursor-based pagination exclusively for admin audit log traversal.
  // Backward-compatible page/limit pagination (for admin UIs that haven't migrated to cursor)
  const { page, limit: rawLimit } = getPagination(req);
  const limit = Math.min(rawLimit, MAX_AUDIT_LIMIT);
  const skip  = (page - 1) * limit;
  const items = await (AuditLog.find as any)(query).sort({ createdAt: -1 }).skip(skip).limit(limit + 1).lean();
  const hasMore    = items.length > limit;
  const pageItems  = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? String(pageItems.at(-1)?._id) : null;

  return ok({ items: pageItems, pagination: { page, limit, nextCursor, hasMore } });
// V063 FIX-MED-05: Rate limit added — endpoint performs DB scan with no throttle.
}, { rateMax: 10, rateWindow: 60 }) // CRIT-03 FIX (V064);
