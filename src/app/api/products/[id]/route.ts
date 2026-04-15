// src/app/api/products/[id]/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB, Product } from '@/lib/mongodb';
import { ok, err, withErrorHandler, withAuth, validateBody } from '@/lib/api';

type Context = { params: { id: string } };

// GET /api/products/:id
export const GET = withErrorHandler(async (_req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Context;
  await connectDB();

  // Support both MongoDB ID and slug
  const query = params.id.match(/^[a-f\d]{24}$/i)
    ? { _id: params.id }
    : { slug: params.id };

  const product = await Product.findOne({ ...query, isActive: true }).lean();
  if (!product) return err('Product not found', 404);
  return ok(product);
});

// PUT /api/products/:id
export const PUT = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Context;
  return withAuth(req, async () => {
    await connectDB();
    const body = await req.json();
    const product = await Product.findByIdAndUpdate(params.id, body, { new: true, runValidators: true });
    if (!product) return err('Product not found', 404);
    return ok(product);
  }, ['admin', 'staff']);
});

// DELETE /api/products/:id
export const DELETE = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Context;
  return withAuth(req, async () => {
    await connectDB();
    const product = await Product.findByIdAndUpdate(
      params.id, { isActive: false }, { new: true }
    );
    if (!product) return err('Product not found', 404);
    return ok({ message: 'Product deactivated' });
  }, ['admin']);
});

// ═══════════════════════════════════════════════════════════════
// src/app/api/orders/route.ts
// ═══════════════════════════════════════════════════════════════
import { connectDB as connectDB2, Order, Product as ProductModel, Coupon } from '@/lib/mongodb';
import { ok as ok2, err as err2, withErrorHandler as weh2, withAuth as wa2, validateBody as vb2, getPagination as gp2 } from '@/lib/api';

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

export const GET_ORDERS = weh2(async (req: NextRequest) => {
  return wa2(req, async (_req, session) => {
    await connectDB2();
    const { page, limit, skip } = gp2(req);
    const url = new URL(req.url);
    const status    = url.searchParams.get('status');
    const isAdmin   = session!.user.role === 'admin';

    const filter: Record<string, unknown> = {};
    if (!isAdmin) filter.userId = session!.user.id;  // customers see only their orders
    if (status)   filter.status = status;

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);

    return ok2({ orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  });
});

export const POST_ORDERS = weh2(async (req: NextRequest) => {
  const validation = await vb2(req, CreateOrderSchema);
  if ('error' in validation) return validation.error;

  await connectDB2();
  const { customer, shippingAddress, items, paymentMethod, couponCode, notes } = validation.data;

  // Fetch products and validate stock
  const productIds = items.map(i => i.productId);
  const products = await ProductModel.find({ _id: { $in: productIds }, isActive: true });
  if (products.length !== productIds.length) return err2('One or more products not found', 404);

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

  return ok2(order, 201);
});
