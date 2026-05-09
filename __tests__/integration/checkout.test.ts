// __tests__/integration/checkout.test.ts — Cart → Order → Payment flow
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDB, Product, Order, Coupon } from '@/lib/mongodb';
import { createOrder } from '@/services/order.service';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await connectDB();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Promise.all([
    Product.deleteMany({}),
    Order.deleteMany({}),
    Coupon.deleteMany({}),
  ]);
});

const PRODUCT_FIXTURE = {
  slug: 'oslo-sofa', nameEn: 'Oslo Sofa', nameAr: 'أريكة أوسلو',
  price: 3000, stock: 10, images: ['https://example.com/img.jpg'],
  category: { main: 'living' }, isActive: true, isFeatured: false,
  rating: 0, reviewCount: 0, colors: [], tags: [],
  sku: 'HEM-LIV-0001',
};

const CUSTOMER_FIXTURE = {
  firstName: 'Ahmed', lastName: 'Hassan',
  email: 'ahmed@test.com', phone: '01234567890',
};

const ADDRESS_FIXTURE = {
  street: '123 Test Street', city: 'Cairo',
  governorate: 'Cairo', postalCode: '11511',
};

describe('createOrder', () => {
  it('creates a COD order and decrements stock', async () => {
    const product = await Product.create(PRODUCT_FIXTURE);

    const result = await createOrder({
      customer: CUSTOMER_FIXTURE,
      shippingAddress: ADDRESS_FIXTURE,
      items: [{ productId: product._id.toString(), quantity: 2 }],
      paymentMethod: 'cod',
    });

    expect(result.order.orderNumber).toMatch(/^HEM-\d{4}-\d{5}$/);
    expect(result.order.status).toBe('confirmed');
    expect(result.order.total).toBe(3000 * 2 + 299); // 2×3000 + shipping (under 5000 threshold)
    expect(result.iframeUrl).toBeNull();

    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct!.stock).toBe(8); // 10 - 2
  });

  it('applies free shipping when subtotal >= 5000', async () => {
    const product = await Product.create({ ...PRODUCT_FIXTURE, price: 3000, slug: 'big-sofa', sku: 'HEM-LIV-0002' });

    const result = await createOrder({
      customer: CUSTOMER_FIXTURE,
      shippingAddress: ADDRESS_FIXTURE,
      items: [{ productId: product._id.toString(), quantity: 2 }], // 6000 EGP
      paymentMethod: 'cod',
    });

    expect(result.order.shipping).toBe(0);
    expect(result.order.total).toBe(6000);
  });

  it('rejects order when product out of stock', async () => {
    const product = await Product.create({ ...PRODUCT_FIXTURE, stock: 1, slug: 'rare-chair', sku: 'HEM-LIV-0003' });

    await expect(createOrder({
      customer: CUSTOMER_FIXTURE,
      shippingAddress: ADDRESS_FIXTURE,
      items: [{ productId: product._id.toString(), quantity: 5 }],
      paymentMethod: 'cod',
    })).rejects.toThrow(/only has 1 units in stock/);
  });

  it('rejects order with unavailable product ID', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(createOrder({
      customer: CUSTOMER_FIXTURE,
      shippingAddress: ADDRESS_FIXTURE,
      items: [{ productId: fakeId, quantity: 1 }],
      paymentMethod: 'cod',
    })).rejects.toThrow(/unavailable/);
  });

  it('applies percentage coupon discount', async () => {
    const product = await Product.create({ ...PRODUCT_FIXTURE, price: 2000, slug: 'desk', sku: 'HEM-OFF-0001' });
    await Coupon.create({
      code: 'SAVE10', type: 'percentage', value: 10,
      minOrderValue: 0, isActive: true,
    });

    const result = await createOrder({
      customer: CUSTOMER_FIXTURE,
      shippingAddress: ADDRESS_FIXTURE,
      items: [{ productId: product._id.toString(), quantity: 1 }],
      paymentMethod: 'cod',
      couponCode: 'SAVE10',
    });

    expect(result.order.discount).toBe(200); // 10% of 2000
    expect(result.order.total).toBe(2000 - 200 + 299); // subtotal - discount + shipping
  });

  it('applies fixed coupon discount', async () => {
    const product = await Product.create({ ...PRODUCT_FIXTURE, price: 1500, slug: 'lamp', sku: 'HEM-LIV-0010' });
    await Coupon.create({
      code: 'FLAT500', type: 'fixed', value: 500,
      minOrderValue: 0, isActive: true,
    });

    const result = await createOrder({
      customer: CUSTOMER_FIXTURE,
      shippingAddress: ADDRESS_FIXTURE,
      items: [{ productId: product._id.toString(), quantity: 1 }],
      paymentMethod: 'cod',
      couponCode: 'FLAT500',
    });

    expect(result.order.discount).toBe(500);
    expect(result.order.subtotal).toBe(1500);
  });

  it('rolls back stock on transaction failure', async () => {
    const product = await Product.create({ ...PRODUCT_FIXTURE, stock: 5, slug: 'rollback-item', sku: 'HEM-LIV-0099' });
    const realProductId = product._id.toString();
    const fakeId        = new mongoose.Types.ObjectId().toString();

    await expect(createOrder({
      customer: CUSTOMER_FIXTURE,
      shippingAddress: ADDRESS_FIXTURE,
      items: [
        { productId: realProductId, quantity: 1 },
        { productId: fakeId, quantity: 1 },       // will cause failure
      ],
      paymentMethod: 'cod',
    })).rejects.toThrow();

    // Stock must not have changed
    const unchanged = await Product.findById(product._id);
    expect(unchanged!.stock).toBe(5);
  });
});
