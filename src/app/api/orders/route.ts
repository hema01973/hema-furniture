// src/app/api/orders/route.ts — ACID transaction + atomic order numbers + email queue + admin alerts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import mongoose from 'mongoose';
import { connectDB, Order, Product, Coupon, nextSeq } from '@/lib/mongodb';
import { ok, err, withErrorHandler, withAuth, validateBody, getPagination } from '@/lib/api';
import { getAuthSession } from '@/lib/auth';
import { enqueueEmail } from '@/lib/queue';

const CreateOrderSchema = z.object({
  customer: z.object({
    firstName: z.string().min(2),
    lastName:  z.string().min(2),
    email:     z.string().email(),
    phone:     z.string().min(11),
  }),
  shippingAddress: z.object({
    street:      z.string().min(5),
    city:        z.string().min(2),
    governorate: z.string().min(2),
    postalCode:  z.string().optional(),
  }),
  items: z.array(z.object({
    productId:     z.string().min(1),
    quantity:      z.number().int().positive(),
    selectedColor: z.string().optional(),
  })).min(1, 'Cart is empty'),
  paymentMethod: z.enum(['cod','card','paymob','fawry','valu']).default('cod'),
  couponCode:    z.string().optional(),
  notes:         z.string().max(500).optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  return withAuth(req, async (_req, authSession) => {
    await connectDB();
    const { page, limit, skip } = getPagination(req);
    const url     = new URL(req.url);
    const status  = url.searchParams.get('status');
    const isAdmin = authSession!.user.role === 'admin' || authSession!.user.role === 'staff';
    const filter: Record<string, unknown> = {};
    if (!isAdmin) filter.userId = authSession!.user.id;
    if (status && status !== 'all') filter.status = status;
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);
    return ok({ orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const validation = await validateBody(req, CreateOrderSchema);
  if ('error' in validation) return validation.error;

  await connectDB();
  const { customer, shippingAddress, items, paymentMethod, couponCode, notes } = validation.data;

  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    const productIds = items.map(i => i.productId);
    const products   = await Product.find({ _id: { $in: productIds }, isActive: true }, null, { session: mongoSession }).lean();
    if (products.length !== productIds.length) {
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return err('One or more products are unavailable', 404);
    }

    let subtotal = 0;
    const orderItems = items.map(item => {
      const product = products.find(p => p._id.toString() === item.productId)!;
      if (product.stock < item.quantity)
        throw Object.assign(new Error(`"${product.nameEn}" only has ${product.stock} units in stock`), { status: 400 });
      subtotal += product.price * item.quantity;
      return { productId: product._id, nameEn: product.nameEn, nameAr: product.nameAr, price: product.price, quantity: item.quantity, image: product.images?.[0] ?? '', selectedColor: item.selectedColor };
    });

    let discount = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true }, null, { session: mongoSession });
      if (coupon) {
        const valid = (!coupon.expiresAt || coupon.expiresAt > new Date()) && (!coupon.maxUses || coupon.usedCount < coupon.maxUses) && subtotal >= (coupon.minOrderValue ?? 0);
        if (valid) {
          discount = coupon.type === 'percentage' ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
          await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: 1 } }, { session: mongoSession });
        }
      }
    }

    const shipping = subtotal - discount >= 5000 ? 0 : 299;
    const total    = subtotal - discount + shipping;
    const authSession = await getAuthSession();

    // Atomic order number — no race condition
    const seq         = await nextSeq('orders');
    const orderNumber = `HEM-${new Date().getFullYear()}-${String(seq).padStart(5,'0')}`;

    const [newOrder] = await Order.create([{
      orderNumber,
      userId:          authSession?.user.id ?? undefined,
      customer, shippingAddress, items: orderItems,
      subtotal, shipping, discount, total, paymentMethod, notes,
      status:        paymentMethod === 'cod' ? 'confirmed' : 'pending',
      paymentStatus: 'pending',
      statusHistory: [{ status: paymentMethod === 'cod' ? 'confirmed' : 'pending', timestamp: new Date() }],
    }], { session: mongoSession });

    await Promise.all(items.map(item =>
      Product.findByIdAndUpdate(item.productId, { $inc: { stock: -item.quantity } }, { session: mongoSession })
    ));

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    // Queue confirmation email (non-blocking, with retries)
    enqueueEmail({ type: 'orderConfirmation', order: newOrder.toObject() }).catch(() => {});

    // Online payment: create Paymob session
    if (paymentMethod === 'paymob' || paymentMethod === 'card') {
      try {
        const { createPaymobSession } = await import('@/lib/paymob');
        const { iframeUrl, paymobOrderId } = await createPaymobSession(
          { amount: total * 100, items: orderItems.map(i => ({ name: i.nameEn, amount_cents: i.price * 100, description: i.nameEn, quantity: i.quantity })) },
          { firstName: customer.firstName, lastName: customer.lastName, email: customer.email, phone: customer.phone, city: shippingAddress.city }
        );
        await Order.findByIdAndUpdate(newOrder._id, { paymobOrderId: paymobOrderId.toString() });
        return ok({ order: newOrder, iframeUrl }, 201);
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'Unknown error';
        await Order.findByIdAndUpdate(newOrder._id, { paymentStatus: 'failed', paymentFailureNotified: true });
        // Notify customer AND admin
        enqueueEmail({ type: 'paymentFailed',     order: newOrder.toObject() }).catch(() => {});
        enqueueEmail({ type: 'adminPaymentAlert', order: newOrder.toObject(), reason }).catch(() => {});
        return ok({ order: newOrder, iframeUrl: null, warning: 'Payment session could not be created. Retry from your orders page.' }, 201);
      }
    }

    return ok({ order: newOrder }, 201);

  } catch (error: unknown) {
    if (mongoSession.inTransaction()) { await mongoSession.abortTransaction(); }
    mongoSession.endSession();
    if (error instanceof Error && 'status' in error) return err(error.message, (error as Error & { status: number }).status);
    throw error;
  }
});
