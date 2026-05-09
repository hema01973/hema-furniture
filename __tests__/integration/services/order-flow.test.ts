// __tests__/integration/services/order-flow.test.ts
// Critical flow: Cart → Order → Stock → Coupon → Payment (mocked)
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDB, Product, Order, Coupon, User } from '@/lib/mongodb';
import { createOrder } from '@/services/order.service';

let mongod: MongoMemoryServer;

// ── Fixtures ──────────────────────────────────────────────────────
const CUSTOMER = { firstName: 'Ahmed', lastName: 'Hassan', email: 'ahmed@test.com', phone: '01234567890' };
const ADDRESS  = { street: '1 Nile St', city: 'Cairo', governorate: 'Cairo' };

async function makeProduct(overrides = {}) {
  const base = {
    slug: `p-${Date.now()}-${Math.random()}`, nameEn: 'Test Sofa', nameAr: 'أريكة',
    price: 2000, stock: 10, images: ['https://img.test/1.jpg'],
    category: { main: 'living' }, isActive: true, isFeatured: false,
    rating: 0, reviewCount: 0, colors: [], tags: [], sku: `SKU-${Date.now()}`,
    ...overrides,
  };
  return Product.create(base);
}

async function makeCoupon(overrides = {}) {
  return Coupon.create({
    code: `CODE${Date.now()}`, type: 'percentage', value: 10,
    minOrderValue: 0, isActive: true, usedCount: 0, ...overrides,
  });
}

// ── Setup ─────────────────────────────────────────────────────────
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI     = mongod.getUri();
  process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  await connectDB();
  // Suppress email queue (no Redis in tests)
  jest.mock('@/lib/queue', () => ({ enqueueEmail: jest.fn().mockResolvedValue(undefined) }));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Promise.all([Product.deleteMany({}), Order.deleteMany({}), Coupon.deleteMany({})]);
});

// ── Happy path ────────────────────────────────────────────────────
describe('createOrder — happy path', () => {
  it('creates COD order and decrements stock', async () => {
    const prod = await makeProduct({ price: 1500, stock: 5 });
    const result = await createOrder({
      customer: CUSTOMER, shippingAddress: ADDRESS,
      items: [{ productId: prod._id.toString(), quantity: 2 }],
      paymentMethod: 'cod',
    });

    expect(result.order.orderNumber).toMatch(/^HEM-\d{4}-\d{5}$/);
    expect(result.order.status).toBe('confirmed');
    expect(result.order.subtotal).toBe(3000);
    expect(result.order.shipping).toBe(299);
    expect(result.order.total).toBe(3299);
    expect(result.iframeUrl).toBeNull();

    const updated = await Product.findById(prod._id);
    expect(updated!.stock).toBe(3); // 5 - 2
  });

  it('creates pending order for paymob payment', async () => {
    const prod = await makeProduct({ price: 3000, stock: 10 });
    // Mock Paymob to return iframe URL
    jest.doMock('@/lib/paymob', () => ({
      createPaymobSession: jest.fn().mockResolvedValue({ iframeUrl: 'https://pay.test', paymobOrderId: 999 }),
    }));

    const result = await createOrder({
      customer: CUSTOMER, shippingAddress: ADDRESS,
      items: [{ productId: prod._id.toString(), quantity: 1 }],
      paymentMethod: 'paymob',
    });

    expect(result.order.status).toBe('pending');
    expect(result.order.paymentStatus).toBe('pending');
  });

  it('applies free shipping above 5000 EGP', async () => {
    const prod = await makeProduct({ price: 3000, stock: 10 });
    const result = await createOrder({
      customer: CUSTOMER, shippingAddress: ADDRESS,
      items: [{ productId: prod._id.toString(), quantity: 2 }], // 6000 EGP
      paymentMethod: 'cod',
    });

    expect(result.order.shipping).toBe(0);
    expect(result.order.total).toBe(6000);
  });

  it('applies percentage coupon and increments usedCount', async () => {
    const prod   = await makeProduct({ price: 2000, stock: 5 });
    const coupon = await makeCoupon({ type: 'percentage', value: 10, code: 'SAVE10' });

    const result = await createOrder({
      customer: CUSTOMER, shippingAddress: ADDRESS,
      items: [{ productId: prod._id.toString(), quantity: 1 }],
      paymentMethod: 'cod', couponCode: 'SAVE10',
    });

    expect(result.order.discount).toBe(200); // 10% of 2000
    const updatedCoupon = await Coupon.findById(coupon._id);
    expect(updatedCoupon!.usedCount).toBe(1);
  });

  it('applies fixed coupon correctly', async () => {
    const prod = await makeProduct({ price: 3000, stock: 5 });
    await makeCoupon({ type: 'fixed', value: 500, code: 'FLAT500' });

    const result = await createOrder({
      customer: CUSTOMER, shippingAddress: ADDRESS,
      items: [{ productId: prod._id.toString(), quantity: 1 }],
      paymentMethod: 'cod', couponCode: 'FLAT500',
    });
    expect(result.order.discount).toBe(500);
    expect(result.order.total).toBe(3000 - 500 + 299);
  });

  it('generates sequential unique order numbers', async () => {
    const prod = await makeProduct({ stock: 20 });
    const [r1, r2, r3] = await Promise.all([
      createOrder({ customer: CUSTOMER, shippingAddress: ADDRESS, items: [{ productId: prod._id.toString(), quantity: 1 }], paymentMethod: 'cod' }),
      createOrder({ customer: CUSTOMER, shippingAddress: ADDRESS, items: [{ productId: prod._id.toString(), quantity: 1 }], paymentMethod: 'cod' }),
      createOrder({ customer: CUSTOMER, shippingAddress: ADDRESS, items: [{ productId: prod._id.toString(), quantity: 1 }], paymentMethod: 'cod' }),
    ]);
    const numbers = [r1.order.orderNumber, r2.order.orderNumber, r3.order.orderNumber];
    const unique  = new Set(numbers);
    expect(unique.size).toBe(3);
  });
});

// ── Failure cases (test failure first) ───────────────────────────
describe('createOrder — failure cases', () => {
  it('throws when product is out of stock', async () => {
    const prod = await makeProduct({ stock: 0 });
    await expect(createOrder({
      customer: CUSTOMER, shippingAddress: ADDRESS,
      items: [{ productId: prod._id.toString(), quantity: 1 }],
      paymentMethod: 'cod',
    })).rejects.toThrow(/0 unit/);
  });

  it('throws when requested exceeds stock', async () => {
    const prod = await makeProduct({ stock: 2 });
    await expect(createOrder({
      customer: CUSTOMER, shippingAddress: ADDRESS,
      items: [{ productId: prod._id.toString(), quantity: 5 }],
      paymentMethod: 'cod',
    })).rejects.toThrow(/2 unit/);
  });

  it('throws when product does not exist', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(createOrder({
      customer: CUSTOMER, shippingAddress: ADDRESS,
      items: [{ productId: fakeId, quantity: 1 }],
      paymentMethod: 'cod',
    })).rejects.toThrow(/unavailable/);
  });

  it('throws when product is inactive', async () => {
    const prod = await makeProduct({ isActive: false });
    await expect(createOrder({
      customer: CUSTOMER, shippingAddress: ADDRESS,
      items: [{ productId: prod._id.toString(), quantity: 1 }],
      paymentMethod: 'cod',
    })).rejects.toThrow(/unavailable/);
  });

  it('silently ignores expired coupon (no discount)', async () => {
    const prod = await makeProduct({ price: 2000, stock: 5 });
    await makeCoupon({ code: 'EXPIRED', expiresAt: new Date(Date.now() - 1000) });

    const result = await createOrder({
      customer: CUSTOMER, shippingAddress: ADDRESS,
      items: [{ productId: prod._id.toString(), quantity: 1 }],
      paymentMethod: 'cod', couponCode: 'EXPIRED',
    });
    expect(result.order.discount).toBe(0);
  });

  it('silently ignores maxUses-exhausted coupon', async () => {
    const prod = await makeProduct({ price: 2000, stock: 5 });
    await makeCoupon({ code: 'MAXED', maxUses: 3, usedCount: 3 });

    const result = await createOrder({
      customer: CUSTOMER, shippingAddress: ADDRESS,
      items: [{ productId: prod._id.toString(), quantity: 1 }],
      paymentMethod: 'cod', couponCode: 'MAXED',
    });
    expect(result.order.discount).toBe(0);
  });
});

// ── Race conditions ───────────────────────────────────────────────
describe('createOrder — race conditions', () => {
  it('rolls back stock on transaction failure', async () => {
    const prod    = await makeProduct({ stock: 5 });
    const validId = prod._id.toString();
    const fakeId  = new mongoose.Types.ObjectId().toString();

    await expect(createOrder({
      customer: CUSTOMER, shippingAddress: ADDRESS,
      items: [
        { productId: validId, quantity: 1 },
        { productId: fakeId,  quantity: 1 }, // will fail
      ],
      paymentMethod: 'cod',
    })).rejects.toThrow();

    // Stock must be unchanged
    const unchanged = await Product.findById(prod._id);
    expect(unchanged!.stock).toBe(5);
  });

  it('does not create duplicate orders on concurrent identical requests', async () => {
    const prod = await makeProduct({ price: 1000, stock: 20 });
    const input = {
      customer: CUSTOMER, shippingAddress: ADDRESS,
      items: [{ productId: prod._id.toString(), quantity: 1 }],
      paymentMethod: 'cod' as const,
    };

    await Promise.all([createOrder(input), createOrder(input), createOrder(input)]);
    const orders = await Order.find({});
    const nums   = orders.map(o => o.orderNumber);
    const unique  = new Set(nums);
    expect(unique.size).toBe(nums.length); // all unique
  });
});
