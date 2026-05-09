// __tests__/integration/analytics.service.test.ts
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDB, Order, Product, User } from '@/lib/mongodb';
import { getDashboardStats } from '@/services/analytics.service';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  delete process.env.REDIS_URL;
  await connectDB();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Promise.all([Order.deleteMany({}), Product.deleteMany({}), User.deleteMany({})]);
});

const ORDER_BASE = {
  customer:        { firstName: 'A', lastName: 'B', email: 'a@b.com', phone: '01234567890' },
  shippingAddress: { street: '1 St', city: 'Cairo', governorate: 'Cairo' },
  items:           [{ productId: new mongoose.Types.ObjectId(), nameEn: 'P', nameAr: 'م', price: 1000, quantity: 1, image: '' }],
  paymentMethod:   'cod',
  paymentStatus:   'pending',
  subtotal:        1000,
  shipping:        299,
  discount:        0,
};

describe('getDashboardStats', () => {
  it('returns zeroed stats when no data exists', async () => {
    const stats = await getDashboardStats();
    expect(stats.revenue.total).toBe(0);
    expect(stats.orders.total).toBe(0);
    expect(stats.products.total).toBe(0);
    expect(stats.recentOrders).toHaveLength(0);
  });

  it('calculates current month revenue excluding cancelled orders', async () => {
    const now = new Date();
    await Order.create([
      { ...ORDER_BASE, total: 2000, status: 'confirmed', orderNumber: 'HEM-1', createdAt: now },
      { ...ORDER_BASE, total: 3000, status: 'delivered', orderNumber: 'HEM-2', createdAt: now },
      { ...ORDER_BASE, total: 5000, status: 'cancelled', orderNumber: 'HEM-3', createdAt: now },
    ]);
    const stats = await getDashboardStats();
    expect(stats.revenue.total).toBe(5000); // 2000 + 3000 (cancelled excluded)
    expect(stats.orders.total).toBe(3);     // all orders counted
  });

  it('includes up to 10 recent orders', async () => {
    const orders = Array.from({ length: 12 }, (_, i) => ({
      ...ORDER_BASE,
      total:       1000,
      status:      'confirmed',
      orderNumber: `HEM-${i + 10}`,
    }));
    await Order.insertMany(orders);
    const stats = await getDashboardStats();
    expect(stats.recentOrders.length).toBeLessThanOrEqual(10);
  });

  it('groups orders by status', async () => {
    await Order.create([
      { ...ORDER_BASE, total: 1000, status: 'pending',   orderNumber: 'HEM-P1' },
      { ...ORDER_BASE, total: 1000, status: 'pending',   orderNumber: 'HEM-P2' },
      { ...ORDER_BASE, total: 1000, status: 'delivered', orderNumber: 'HEM-D1' },
    ]);
    const stats = await getDashboardStats();
    expect(stats.ordersByStatus['pending']).toBe(2);
    expect(stats.ordersByStatus['delivered']).toBe(1);
  });

  it('counts active products', async () => {
    await Product.create([
      { slug: 'p1', nameEn: 'A', nameAr: 'أ', price: 1000, category: { main: 'living' }, stock: 5, images: ['i'], isActive: true,  isFeatured: false, rating: 0, reviewCount: 0, colors: [], tags: [], sku: 'H1' },
      { slug: 'p2', nameEn: 'B', nameAr: 'ب', price: 2000, category: { main: 'bedroom' }, stock: 0, images: ['i'], isActive: false, isFeatured: false, rating: 0, reviewCount: 0, colors: [], tags: [], sku: 'H2' },
    ]);
    const stats = await getDashboardStats();
    expect(stats.products.total).toBe(1);
  });
});
