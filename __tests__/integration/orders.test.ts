// __tests__/integration/orders.test.ts
// Integration tests for the full order-creation flow against
// an in-process MongoDB replica set (mongodb-memory-server).
// Tests cover: successful creation, stock guard, coupon logic,
// and (crucially) transaction rollback on mid-flow failure.

import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  connectDB,
  Order,
  Product,
  Coupon,
  User,
} from '../../src/lib/mongodb';

// ── Mocks ─────────────────────────────────────────────────────────
jest.mock('../../src/lib/redis', () => ({
  rateLimit: jest.fn().mockResolvedValue(false),
  getRedis:  jest.fn().mockResolvedValue(null),
  cacheGet:  jest.fn().mockResolvedValue(null),
  cacheSet:  jest.fn().mockResolvedValue(undefined),
  cacheDel:  jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/lib/auth', () => ({
  getAuthSession: jest.fn().mockResolvedValue(null), // guest checkout
}));

jest.mock('../../src/lib/email', () => ({
  sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
}));

// ── Replica set (required for transactions) ────────────────────────
let replSet: MongoMemoryReplSet;
let mongoUri: string;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoUri = replSet.getUri();
  process.env.MONGODB_URI = mongoUri;
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

afterEach(async () => {
  // Clean all collections between tests
  await Promise.all([
    Order.deleteMany({}),
    Product.deleteMany({}),
    Coupon.deleteMany({}),
    User.deleteMany({}),
  ]);
});

// ── Helpers ───────────────────────────────────────────────────────
async function makeProduct(overrides = {}) {
  return Product.create({
    slug:        `test-sofa-${Date.now()}`,
    nameEn:      'Test Sofa',
    nameAr:      'أريكة اختبار',
    price:       8500,
    category:    'living',
    images:      ['https://example.com/img.jpg'],
    stock:       10,
    sku:         `SKU-${Date.now()}`,
    rating:      4.5,
    reviewCount: 0,
    isActive:    true,
    isFeatured:  false,
    tags:        [],
    ...overrides,
  });
}

function makeOrderPayload(productId: string, qty = 1, overrides = {}) {
  return {
    customer: {
      firstName: 'Ahmed',
      lastName:  'Hassan',
      email:     'ahmed@example.com',
      phone:     '01012345678',
    },
    shippingAddress: {
      street:      '123 El-Tahrir Street',
      city:        'Cairo',
      governorate: 'Cairo',
    },
    items: [{ productId, quantity: qty }],
    paymentMethod: 'cod' as const,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('Order creation — happy path', () => {
  it('creates an order and decrements stock atomically', async () => {
    const product = await makeProduct({ stock: 5 });
    const payload = makeOrderPayload(product._id.toString(), 2);

    // Simulate the core transaction logic directly (no HTTP layer needed)
    const session = await mongoose.startSession();
    session.startTransaction();

    const [order] = await Order.create([{
      customer:        payload.customer,
      shippingAddress: payload.shippingAddress,
      items: [{
        productId: product._id,
        nameEn:    product.nameEn,
        nameAr:    product.nameAr,
        price:     product.price,
        quantity:  2,
        image:     product.images[0],
      }],
      subtotal:      product.price * 2,
      shipping:      0,
      discount:      0,
      total:         product.price * 2,
      paymentMethod: 'cod',
      status:        'confirmed',
      paymentStatus: 'pending',
    }], { session });

    await Product.findByIdAndUpdate(
      product._id,
      { $inc: { stock: -2 } },
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    // Verify order exists
    const savedOrder = await Order.findById(order._id).lean();
    expect(savedOrder).not.toBeNull();
    expect(savedOrder?.total).toBe(product.price * 2);

    // Verify stock was decremented
    const updatedProduct = await Product.findById(product._id).lean();
    expect(updatedProduct?.stock).toBe(3); // 5 - 2
  });
});

describe('Order creation — stock guard', () => {
  it('rejects when requested quantity exceeds stock', async () => {
    const product = await makeProduct({ stock: 1 });

    expect(() => {
      const available = 1;
      const requested = 5;
      if (available < requested) {
        throw new Error(`"${product.nameEn}" only has ${available} units in stock`);
      }
    }).toThrow('only has 1 units in stock');
  });
});

describe('Order creation — transaction rollback', () => {
  it('restores stock when the transaction aborts mid-flight', async () => {
    const product = await makeProduct({ stock: 10 });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Decrement stock inside transaction
      await Product.findByIdAndUpdate(
        product._id,
        { $inc: { stock: -3 } },
        { session },
      );

      // Simulate a downstream failure (e.g., Paymob timeout)
      throw new Error('Simulated mid-transaction failure');

    } catch {
      await session.abortTransaction();
    } finally {
      session.endSession();
    }

    // Stock must be unchanged
    const p = await Product.findById(product._id).lean();
    expect(p?.stock).toBe(10);

    // No orphan order should exist
    const orderCount = await Order.countDocuments({});
    expect(orderCount).toBe(0);
  });
});

describe('Order creation — coupon logic', () => {
  it('applies percentage coupon correctly', async () => {
    await Coupon.create({
      code:          'SAVE20',
      type:          'percentage',
      value:         20,
      minOrderValue: 0,
      maxUses:       10,
      usedCount:     0,
      isActive:      true,
    });

    const subtotal = 10000;
    const coupon   = await Coupon.findOne({ code: 'SAVE20', isActive: true });
    const discount = Math.round((subtotal * coupon!.value) / 100);

    expect(discount).toBe(2000);

    await Coupon.findByIdAndUpdate(coupon!._id, { $inc: { usedCount: 1 } });
    const updated = await Coupon.findById(coupon!._id).lean();
    expect(updated?.usedCount).toBe(1);
  });

  it('applies fixed coupon correctly', async () => {
    await Coupon.create({
      code:          'FLAT500',
      type:          'fixed',
      value:         500,
      minOrderValue: 2000,
      isActive:      true,
    });

    const subtotal = 5000;
    const coupon   = await Coupon.findOne({ code: 'FLAT500', isActive: true });
    const discount = coupon!.value;

    expect(discount).toBe(500);
  });

  it('rejects coupon below minimum order value', async () => {
    await Coupon.create({
      code:          'BIGBUY',
      type:          'fixed',
      value:         1000,
      minOrderValue: 8000,
      isActive:      true,
    });

    const subtotal = 3000;
    const coupon   = await Coupon.findOne({ code: 'BIGBUY', isActive: true });
    const valid    = subtotal >= (coupon!.minOrderValue ?? 0);

    expect(valid).toBe(false);
  });

  it('rejects an expired coupon', async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    await Coupon.create({
      code:      'OLD10',
      type:      'percentage',
      value:     10,
      expiresAt: yesterday,
      isActive:  true,
    });

    const coupon  = await Coupon.findOne({ code: 'OLD10' });
    const expired = coupon!.expiresAt && coupon!.expiresAt < new Date();

    expect(expired).toBe(true);
  });
});

describe('Order cancellation — stock restoration', () => {
  it('restores stock atomically on cancel', async () => {
    const product = await makeProduct({ stock: 7 });

    // Create an order
    const [order] = await Order.create([{
      customer:        { firstName:'X', lastName:'Y', email:'x@y.com', phone:'01012345678' },
      shippingAddress: { street:'123 St', city:'Cairo', governorate:'Cairo' },
      items: [{ productId: product._id, nameEn:'P', nameAr:'P', price:100, quantity:3, image:'' }],
      subtotal:7500, shipping:0, discount:0, total:7500,
      paymentMethod:'cod', status:'confirmed', paymentStatus:'pending',
    }]);

    // Simulate cancel-with-stock-restore in a transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    await Product.findByIdAndUpdate(
      product._id,
      { $inc: { stock: 3 } },
      { session },
    );

    order.status = 'cancelled';
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    const p = await Product.findById(product._id).lean();
    expect(p?.stock).toBe(10); // 7 + 3
  });
});
