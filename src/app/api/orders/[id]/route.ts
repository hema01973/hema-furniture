// src/app/api/orders/[id]/route.ts — transactional cancel restores stock atomically
import { NextRequest } from 'next/server';
import { z } from 'zod';
import mongoose from 'mongoose';
import { connectDB, Order, Product } from '@/lib/mongodb';
import { ok, err, withErrorHandler, withAuth, validateBody } from '@/lib/api';

type Ctx = { params: { id: string } };

export const GET = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  return withAuth(req, async (_req, session) => {
    await connectDB();
    const order = await Order.findById(params.id).lean();
    if (!order) return err('Order not found', 404);
    if (session!.user.role === 'customer' && order.userId?.toString() !== session!.user.id) return err('Forbidden', 403);
    return ok(order);
  });
});

const UpdateOrderSchema = z.object({
  status:            z.enum(['pending','confirmed','processing','shipped','out_for_delivery','delivered','cancelled']).optional(),
  trackingNumber:    z.string().optional(),
  trackingUrl:       z.string().url().optional(),
  notes:             z.string().optional(),
  estimatedDelivery: z.string().datetime().optional(),
});

export const PUT = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  return withAuth(req, async () => {
    const v = await validateBody(req, UpdateOrderSchema);
    if ('error' in v) return v.error;
    await connectDB();
    const update: Record<string, unknown> = { ...v.data };
    if (v.data.status === 'delivered') update.deliveredAt = new Date();
    const order = await Order.findByIdAndUpdate(params.id, update, { new: true });
    if (!order) return err('Order not found', 404);
    return ok(order);
  }, ['admin', 'staff']);
});

// Transactional cancel — stock restored atomically
export const DELETE = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  return withAuth(req, async (_req, session) => {
    await connectDB();
    const mongoSession = await mongoose.startSession();
    mongoSession.startTransaction();
    try {
      const order = await Order.findById(params.id).session(mongoSession);
      if (!order) { await mongoSession.abortTransaction(); mongoSession.endSession(); return err('Order not found', 404); }
      if (session!.user.role === 'customer') {
        if (order.userId?.toString() !== session!.user.id) { await mongoSession.abortTransaction(); mongoSession.endSession(); return err('Forbidden', 403); }
        if (!['pending','confirmed'].includes(order.status)) { await mongoSession.abortTransaction(); mongoSession.endSession(); return err('Cannot cancel this order', 400); }
      }
      await Promise.all(
        order.items.map((item: { productId: string; quantity: number }) =>
          Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } }, { session: mongoSession })
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
  });
});
