// src/app/api/v1/admin/audit-integrity/route.ts — HemaV066
// V063 FIX-HIGH-02: Reduced default scan limit from 10,000 → 1,000 and cap from 50,000 → 5,000.
//   Added cursor-based pagination via afterId param.
// V061 FIX-B: Audit log integrity verification endpoint.

import { NextRequest } from 'next/server';
import mongoose        from 'mongoose';
import { ok, err, withErrorHandler } from '@/lib/api';
import { requirePermission }        from '@/lib/authz';
import { connectDB, verifyAuditLogIntegrity } from '@/lib/mongodb';
import { logger }                   from '@/lib/logger';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await requirePermission(req, 'read:admin');
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);

  // V063 FIX-HIGH-02: Reduced default from 10,000 → 1,000 and cap from 50,000 → 5,000.
  // Large integrity checks must use cursor pagination (afterId param) to page through results.
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '1000', 10), 5_000);

  // V063 FIX-HIGH-02: Cursor param for paginated integrity checks.
  const afterId = url.searchParams.get('afterId');
  const cursorFilter = afterId && /^[a-f\d]{24}$/i.test(afterId)
    ? { _id: { $gt: new mongoose.Types.ObjectId(afterId) } }
    : {};

  logger.info('[AuditIntegrity] Starting integrity check', {
    adminId: auth.session.user.id,
    limit,
    afterId: afterId ?? 'none',
  });

  try {
    await connectDB();
    const result = await verifyAuditLogIntegrity({ limit, filter: cursorFilter });

    if (!result.valid) {
      logger.error('[AuditIntegrity] INTEGRITY VIOLATION DETECTED — audit chain broken', {
        adminId:    auth.session.user.id,
        checked:    result.checked,
        breaks:     result.breaks.length,
        firstBreak: result.breaks[0] ?? null,
      });
      return ok({ ...result, severity: 'CRITICAL', nextCursor: result.nextCursor ?? null }, 200);
    }

    logger.info('[AuditIntegrity] Integrity check passed', {
      adminId:    auth.session.user.id,
      checked:    result.checked,
      hmacChecked: result.hmacChecked,
    });

    return ok({ ...result, severity: 'OK', nextCursor: result.nextCursor ?? null });
  } catch (e) {
    logger.error('[AuditIntegrity] Integrity check failed with error', {
      error: e instanceof Error ? e.message : String(e),
    });
    return err('Integrity check failed — see server logs', 500);
  }
}, { rateMax: 10, rateWindow: 60 });
