// src/... — HemaV050: validateObjectId added to all handlers (VULN-02)
// V031: PUT cancel restores stock atomically
// V065 VULN-03/07: Added field projection to GET — guestEmail, customer.phone,
//   idempotencyKey, claimTokenHash must never leave the server.
// V065 VULN-04: Added rateMax:20/rateWindow:60 to GET, PUT, DELETE — missed in V064 CRIT-03.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import mongoose from 'mongoose';
import { connectDB, Order, Product, AuditLog } from '@/lib/mongodb';
import { getIP } from '@/lib/api';
import { ok, err, withErrorHandler, validateBody, validateObjectId } from '@/lib/api';
import { requirePermission, requireAnyPermission, requireOwnership } from '@/lib/authz';
import { logger } from '@/lib/logger';

type Ctx = { params: { id: string } };

// VULN-03/07 FIX (V065): Explicit exclusion projection for the customer-facing GET.
// Fields excluded and rationale:
//   - guestEmail:     PII duplicate; the canonical address is in customer.email
//   - customer.phone: PII — not required for order display; no field-level permission exists
//   - idempotencyKey: Revealing this enables replay-detection bypass on retry endpoints
//   - claimTokenHash: SHA-256 of the one-time guest claim token; must NEVER leave the server —
//                     exposure allows offline pre-image searches and token-slot enumeration
//   - __v:            Mongoose internal version key; no business value
const ORDER_SAFE_PROJECTION = {
  guestEmail:       0,
  idempotencyKey:   0,
  claimTokenHash:   0,
  __v:              0,
  'customer.phone': 0,
} as const;

export const GET = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  const idErr = validateObjectId(params.id);
  if (idErr) return idErr;
  // V005: customer needs `read:order:own`, admin/manager/support need `read:order:any`.
  // Either is enough to *enter* the handler — ownership is then checked below.
  const auth = await requireAnyPermission(req, ['read:order:any', 'read:order:own']);
  if (!auth.ok) return auth.response;
  await connectDB();
  // VULN-03/07 FIX (V065): Apply exclusion projection before .lean()
  const order = await (Order.findById as any)(params.id, ORDER_SAFE_PROJECTION).lean() as { userId?: { toString(): string } | string } | null;
  if (!order) return err('Order not found', 404);
  // Resource-level check: anyone with `read:order:any` bypasses; everyone else
  // must own the order. No more `role === 'customer'` string comparisons.
  const own = requireOwnership(auth.session, order.userId?.toString(), 'read:order:any');
  if (own) return own;
  return ok(order);
// VULN-04 FIX (V065): Rate limit — this route was missed in the V064 CRIT-03 pass.
}, { rateMax: 20, rateWindow: 60 });

const UpdateOrderSchema = z.object({
  status:            z.enum(['pending','confirmed','processing','shipped','out_for_delivery','delivered','cancelled']).optional(),
  trackingNumber:    z.string().max(100).optional(),
  trackingUrl:       z.string().url().optional(),
  notes:             z.string().max(500).optional(),
  estimatedDelivery: z.string().datetime().optional(),
});

export const PUT = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  const idErr = validateObjectId(params.id);
  if (idErr) return idErr;
  // V005: cancelling requires `cancel:order:any`; everything else just `write:order`.
  // We pre-parse the body to know which permission to demand BEFORE doing DB work.
  const auth = await requirePermission(req, 'write:order');
  if (!auth.ok) return auth.response;
  const session = auth.session;
  {
    const v = await validateBody(req, UpdateOrderSchema);
    if ('error' in v) return v.error;
    if (v.data.status === 'cancelled') {
      const cancelAuth = await requirePermission(req, 'cancel:order:any');
      if (!cancelAuth.ok) return cancelAuth.response;
    }

    await connectDB();

    // ── If admin is cancelling via PUT, restore stock atomically ─
    // The DELETE endpoint handles customer-initiated cancels with the same
    // stock-restore logic. Admins use PUT to change any status — if they
    // set status=cancelled we must also restore stock, otherwise inventory
    // will be permanently depleted for every admin-cancelled order.
    if (v.data.status === 'cancelled') {
      const mongoSession = await mongoose.startSession();
      mongoSession.startTransaction();
      try {
        const order = await (Order.findById as any)(params.id).session(mongoSession);
        if (!order) {
          await mongoSession.abortTransaction(); mongoSession.endSession();
          return err('Order not found', 404);
        }
        // Only restore stock if order wasn't already cancelled (idempotent)
        if (order.status !== 'cancelled') {
          await Promise.all(
            order.items.map((item: { productId: string; quantity: number }) =>
              (Product.findByIdAndUpdate as any)(
                item.productId,
                { $inc: { stock: item.quantity } },
                { session: mongoSession }
              )
            )
          );
        }
        order.status = 'cancelled';
        await order.save({ session: mongoSession });
        await mongoSession.commitTransaction();
        mongoSession.endSession();
        logger.info('[OrderAPI] Admin cancelled order + stock restored', { orderId: params.id });
        (AuditLog.create as any)({
          userId:     session!.user.id,
          action:     'order.cancel',
          resource:   'Order',
          resourceId: params.id,
          details:    { orderNumber: order.orderNumber },
          ip:         getIP(req),
        }).catch((e: unknown) => logger.warn('[AuditLog] create failed — order.cancel', { error: String(e) }));
        return ok(order.toObject());
      } catch (e) {
        await mongoSession.abortTransaction(); mongoSession.endSession(); throw e;
      }
    }

    // ── Non-cancel status updates ─────────────────────────────────
    const update: Record<string, unknown> = { ...v.data };
    if (v.data.status === 'delivered') update.deliveredAt = new Date();
    const order = await (Order.findByIdAndUpdate as any)(params.id, update, { new: true });
    if (!order) return err('Order not found', 404);
    return ok(order);
  }
// VULN-04 FIX (V065): Rate limit added — missed in V064 CRIT-03 pass.
}, { rateMax: 20, rateWindow: 60 });

// Transactional cancel — stock restored atomically (customer-initiated)
export const DELETE = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  const idErr = validateObjectId(params.id);
  if (idErr) return idErr;
  // V005: either capability is enough to enter the handler; ownership is
  // enforced after we load the order. `cancel:order:any` bypasses ownership
  // and the "pending|confirmed" status restriction (admins can force-cancel).
  const auth = await requireAnyPermission(req, ['cancel:order:any', 'cancel:order:own']);
  if (!auth.ok) return auth.response;
  const session = auth.session;
  {
    await connectDB();
    const mongoSession = await mongoose.startSession();
    mongoSession.startTransaction();
    try {
      const order = await (Order.findById as any)(params.id).session(mongoSession);
      if (!order) { await mongoSession.abortTransaction(); mongoSession.endSession(); return err('Order not found', 404); }
      const own = requireOwnership(session, order.userId?.toString(), 'cancel:order:any');
      if (own) { await mongoSession.abortTransaction(); mongoSession.endSession(); return own; }
      // Customer self-cancel is restricted to early statuses; admins bypass.
      const isAdminCancel = (await import('@/lib/authz')).hasPermission(session.user.role as string, 'cancel:order:any');
      if (!isAdminCancel && !['pending','confirmed'].includes(order.status)) {
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return err('Cannot cancel this order', 400);
      }
      // V004 FIX: idempotency guard. Without this, a customer (or admin)
      // could call DELETE on an already-cancelled order and the stock would
      // be restored AGAIN — silently inflating inventory by item.quantity
      // each call. Now a no-op on already-cancelled orders.
      if (order.status === 'cancelled') {
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return ok({ message: 'Order already cancelled' });
      }
      await Promise.all(
        order.items.map((item: { productId: string; quantity: number }) =>
          (Product.findByIdAndUpdate as any)(item.productId, { $inc: { stock: item.quantity } }, { session: mongoSession })
        )
      );
      order.status = 'cancelled';
      await order.save({ session: mongoSession });
      await mongoSession.commitTransaction();
      mongoSession.endSession();
      return ok({ message: 'Order cancelled and stock restored' });
    } catch (e) {
      await mongoSession.abortTransaction(); mongoSession.endSession(); throw e;
    }
  }
// VULN-04 FIX (V065): Rate limit added — missed in V064 CRIT-03 pass.
}, { rateMax: 10, rateWindow: 60 });
