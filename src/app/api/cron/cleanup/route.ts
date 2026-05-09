// src/app/api/cron/cleanup/route.ts — HemaV069
// CRIT-003 FIX (V069): Added auth.length !== expected.length check before
//   timingSafeEqual buffer write — closes truncation bypass vulnerability.
//   Any payload longer than 512 bytes sharing the first 512 bytes with the
//   valid Bearer token would previously pass the check silently.
// LOW-01 ADVISORY (V066): This endpoint is protected only by CRON_SECRET bearer token.
//   For defense-in-depth, add Vercel cron IP allowlisting in vercel.json:
//   https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
//   The Paymob callback IP allowlist pattern in src/app/api/paymob/callback/route.ts
//   demonstrates the approach. Operator action required — not a code change.
// HemaV050: FIX #2 — timing-safe CRON_SECRET, atomic stock restore
// V027: stale order cancel now restores stock atomically
// Runs daily at 02:00 UTC via Vercel Cron
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectDB, User, Order, Product } from '@/lib/mongodb';
import { logger } from '@/lib/logger';

// CRIT-003 FIX (V069): Added explicit length check before timingSafeEqual buffer write.
// Without this, any payload sharing the first 512 bytes with the valid Bearer token
// would pass the check silently (truncation buffer vulnerability).
// This mirrors the pattern correctly implemented in metrics/route.ts.
function isAuthorized(req: Request): boolean {
  const auth   = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || !auth) return false;
  const expected = `Bearer ${secret}`;
  // Reject immediately if lengths differ — prevents truncation bypass
  if (auth.length !== expected.length) return false;
  const a = Buffer.alloc(512);
  const b = Buffer.alloc(512);
  a.write(auth,     0, 'utf8');
  b.write(expected, 0, 'utf8');
  return crypto.timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectDB();
    const now = new Date();

    // 1. Delete expired email-verification tokens (older than 24h)
    // LOW-006 NOTE (V068): Steps 1 and 2 are idempotent updateMany() operations —
    // if the cleanup process crashes between them, the next scheduled run will safely
    // re-process. MongoDB transactions are not used here because these updates are
    // independent (no stock restoration) and partial completion is safely recoverable.
    const expiredVerifications = await User.updateMany(
      { emailVerificationExpires: { $lt: now }, isEmailVerified: false },
      { $unset: { emailVerificationToken: 1, emailVerificationExpires: 1 } }
    );

    // 2. Delete expired password-reset tokens
    const expiredResets = await User.updateMany(
      { passwordResetExpires: { $lt: now } },
      { $unset: { passwordResetToken: 1, passwordResetExpires: 1 } }
    );

    // 3. Cancel stale pending orders AND restore stock atomically
    // v5.6 FIX: previous version cancelled orders but forgot to return stock to inventory,
    // causing permanent phantom stock reduction for every unfinished online payment.
    const staleThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const staleOrders = await (Order.find as any)({
      status:        'pending',
      paymentStatus: 'pending',
      paymentMethod: { $ne: 'cod' },
      createdAt:     { $lt: staleThreshold },
    }).lean();

    let stockRestoredCount = 0;

    for (const order of staleOrders) {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        // Mark order cancelled
        await (Order.findByIdAndUpdate as any)(
          order._id,
          {
            $set:  { status: 'cancelled' },
            $push: {
              statusHistory: {
                status:    'cancelled',
                note:      'Auto-cancelled: payment not completed within 48h',
                timestamp: now,
              },
            },
          },
          { session }
        );

        // ✅ FIX: sequential — Mongoose ClientSession is not safe for concurrent ops
        for (const item of order.items as Array<{ productId: mongoose.Types.ObjectId; quantity: number }>) {
          await (Product.findByIdAndUpdate as any)(
            item.productId,
            { $inc: { stock: item.quantity } },
            { session }
          );
        }

        await session.commitTransaction();
        stockRestoredCount++;
      } catch (err) {
        await session.abortTransaction();
        logger.error('[Cron/cleanup] Failed to cancel+restore order', {
          orderId: order._id,
          error:   err instanceof Error ? err.message : String(err),
        });
      } finally {
        session.endSession();
      }
    }

    // 4. Unlock accounts whose lockout period has expired
    const unlockedAccounts = await User.updateMany(
      { lockedUntil: { $lt: now } },
      { $unset: { lockedUntil: 1 }, $set: { failedLogins: 0, mfaFailedAttempts: 0 } } // V039 FIX [LOW-03]: reset mfaFailedAttempts to prevent immediate re-lock
    );

    const result = {
      expiredVerifications: expiredVerifications.modifiedCount,
      expiredResets:        expiredResets.modifiedCount,
      staleOrdersCancelled: stockRestoredCount,
      stockRestored:        stockRestoredCount,
      unlockedAccounts:     unlockedAccounts.modifiedCount,
      ranAt:                now.toISOString(),
    };

    logger.info('[Cron/cleanup] Completed', result);
    return NextResponse.json({ success: true, ...result });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[Cron/cleanup] Failed', { error: message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
