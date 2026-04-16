// src/app/api/orders/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB, Order, Product as ProductModel, Coupon } from '@/lib/mongodb';
import { ok, err, withErrorHandler, withAuth, validateBody, getPagination } from '@/lib/api';

const CreateOrderSchema = z.object({
  customer: z.object({
    firstName: z.string().min(2),
    lastName:  z.string().min(2),
    email:     z.string().email(),
    phone:     z.string().min(11),
  }),
  shippingAddress: z.object({
    street:     z.string().min(5),
    city:       z.string().min(2),
    governorate:z.string().min(2),
    postalCode: z.string().optional(),
  }),
  items: z.array(z.object({
    productId:     z.string(),
    quantity:      z.number().int().positive(),
    selectedColor: z.string().optional(),
  })).min(1),
  paymentMethod: z.enum(['cod','card','paymob','fawry','valu']).default('cod'),
  couponCode:    z.string().optional(),
  notes:         z.string().optional(),
});

// GET /api/orders
export const GET = withErrorHandler(async (req: NextRequest) => {
  return withAuth(req, async (_req, session) => {
    await connectDB();
    const { page, limit, skip } = getPagination(req);
    const url = new URL(req.url);
    const status    = url.searchParams.get('status');
    const isAdmin   = session!.user.role === 'admin';

    const filter: Record<string, unknown> = {};
    if (!isAdmin) filter.userId = session!.user.id;
    if (status)   filter.status = status;

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);

    return ok({ orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  });
});

// POST /api/orders
export const POST = withErrorHandler(async (req: NextRequest) => {
  const validation = await validateBody(req, CreateOrderSchema);
  if ('error' in validation) return validation.error;

  await connectDB();
  const { customer, shippingAddress, items, paymentMethod, couponCode, notes } = validation.data;

  // Fetch products and validate stock
  const productIds = items.map(i => i.productId);
  const products = await ProductModel.find({ _id: { $in: productIds }, isActive: true });
  if (products.length !== productIds.length) return err('One or more products not found', 404);

  let subtotal = 0;
  const orderItems = items.map(item => {
    const product = products.find(p => p._id.toString() === item.productId)!;
    if (product.stock < item.quantity) throw new Error(`${product.nameEn} is out of stock`);
    subtotal += product.price * item.quantity;
    return {
      productId:     product._id,
      nameEn:        product.nameEn,
      nameAr:        product.nameAr,
      price:         product.price,
      quantity:      item.quantity,
      image:         product.images[0] ?? '',
      selectedColor: item.selectedColor,
    };
  });

  // Apply coupon
  let discount = 0;
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
    if (coupon && (!coupon.expiresAt || coupon.expiresAt > new Date()) && (!coupon.maxUses || coupon.usedCount < coupon.maxUses) && subtotal >= coupon.minOrderValue) {
      discount = coupon.type === 'percentage' ? (subtotal * coupon.value) / 100 : coupon.value;
      await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: 1 } });
    }
  }

  const shipping = subtotal - discount >= 5000 ? 0 : 299;
  const total    = subtotal - discount + shipping;

  // Get session for userId
  const session2 = await (await import('@/lib/auth')).getAuthSession();

  const order = await Order.create({
    userId: session2?.user.id ?? undefined,
    customer,
    shippingAddress,
    items: orderItems,
    subtotal,
    shipping,
    discount,
    total,
    paymentMethod,
    notes,
  });

  // Decrement stock
  await Promise.all(
    items.map(item =>
      ProductModel.findByIdAndUpdate(item.productId, { $inc: { stock: -item.quantity } })
    )
  );

  // Send confirmation email
  try {
    const { sendOrderConfirmation } = await import('@/lib/email');
    await sendOrderConfirmation(order);
  } catch (e) {
    console.error('Email send failed:', e);
  }

  return ok(order, 201);
});