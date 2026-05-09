// src/... — HemaV066: validateObjectId first check (VULN-02, V38-03)
//   - V031: Actually calls Paymob refund API (was previously a fake DB-only update)
//   - V031: Sends a real refund email (was using orderConfirmation template)
//   - V031: Persists refundId / refundedAmount / refundedAt for audit trail
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB, Order, AuditLog } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody, getIP, validateObjectId, withDbRetry } from '@/lib/api';
import { requirePermission } from '@/lib/authz';
import { logger } from '@/lib/logger';
import { enqueueEmail } from '@/lib/queue';
import { refundPaymobTransaction } from '@/lib/paymob';

type Ctx = { params: { id: string } };

const RefundSchema = z.object({
  reason: z.string().min(3).max(500).optional(),
  amount: z.number().positive().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  // V039: validateObjectId first — fail fast before auth overhead (defense-in-depth)
  // Hema033 FIX [HIGH-01]: validate ObjectId format before hitting MongoDB
  const idErr = validateObjectId(params.id);
  if (idErr) return idErr;
  const auth = await requirePermission(req, 'refund:order');
  if (!auth.ok) return auth.response;
  const session = auth.session;
  {
    const v = await validateBody(req, RefundSchema);
    if ('error' in v) return v.error;

    await connectDB();
    const order = await (Order.findById as any)(params.id);
    if (!order) return err('Order not found', 404);

    if (order.paymentStatus === 'refunded') {
      return err('Order has already been refunded', 409);
    }
    if (order.paymentStatus !== 'paid') {
      return err(`Cannot refund an order with payment status "${order.paymentStatus}"`, 400);
    }

    // Hema033 FIX [HIGH-05]: guard against zero-total orders (e.g. 100% coupon)
    // Calling Paymob with amount=0 causes undefined gateway behaviour
    if (order.total <= 0) return err('Cannot refund a zero-value order', 400);

    const refundAmount = Math.min(v.data.amount ?? order.total, order.total);
    if (refundAmount <= 0) return err('Refund amount must be greater than zero', 400);

    // ── Online refund: must call Paymob first, then update DB ────
    const isOnline = order.paymentMethod === 'paymob' || order.paymentMethod === 'card';
    let refundId: string | undefined;

    if (isOnline) {
      if (!order.paymobTransactionId) {
        return err('Cannot refund: missing Paymob transaction ID', 400);
      }
      try {
        const result = await refundPaymobTransaction(
          order.paymobTransactionId,
          Math.round(refundAmount * 100),
        );
        if (!result.success) return err('Paymob refund declined', 502);
        refundId = result.refundId;
      } catch (e) {
        logger.error('[OrderAPI] Paymob refund failed', {
          orderId: params.id,
          error:   e instanceof Error ? e.message : String(e),
        });
        return err('Refund gateway error — please retry', 502);
      }
    }

    order.paymentStatus = 'refunded';
    order.status        = 'cancelled';
    order.set('refundedAt',     new Date());
    order.set('refundedAmount', refundAmount);
    if (refundId) order.set('paymobRefundId', refundId);
    // V061 FIX-D: withDbRetry wraps order.save() — refund is a write-heavy financial
    // operation; transient deadlocks must not surface as permanent 500s.
    await withDbRetry('refund:order.save', () => order.save());

    logger.info('[OrderAPI] Refund completed', {
      orderId:     params.id,
      orderNumber: order.orderNumber,
      refundAmount,
      refundId,
      adminId:     session.user.id,
      reason:      v.data.reason,
    });

    // WEAK-CODE-01 FIX (V049): AuditLog failure must NOT be silently swallowed on
    // financial operations. A lost refund audit entry means no forensic trail for
    // a real money movement. Log at ERROR level so BetterStack/Sentry raises an alert.
    (AuditLog.create as any)({
      userId:     session.user.id,
      action:     'order.refund',
      resource:   'Order',
      resourceId: params.id,
      details:    { orderNumber: order.orderNumber, refundAmount, refundId, reason: v.data.reason },
      ip:         getIP(req),
    }).catch((e: unknown) =>
      logger.error('[AuditLog] CRITICAL: refund audit write failed — manual reconcile needed', {
        orderId:     params.id,
        orderNumber: order.orderNumber,
        refundAmount,
        error:       String(e),
      })
    );

    // Use the dedicated refund email template (not orderConfirmation)
    enqueueEmail({ type: 'refund', order: order.toObject(), refundAmount }).catch(() => {});

    return ok({
      message:       'Refund completed successfully',
      orderNumber:   order.orderNumber,
      refundAmount,
      refundId,
      paymentStatus: 'refunded',
    });
  }
// V039 FIX [MED-01]: rate limit refund endpoint — financial endpoint must not be
// open to unlimited calls. 10 refunds/min per IP is generous for admin use.
}, { rateMax: 5, rateWindow: 60, failClosed: true });
