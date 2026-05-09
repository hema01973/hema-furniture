// __tests__/integration/product.service.test.ts
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDB, Product } from '@/lib/mongodb';
import { listProducts, getProduct, invalidateProductCache } from '@/services/product.service';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  // Disable Redis for these tests
  delete process.env.REDIS_URL;
  await connectDB();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Product.deleteMany({});
});

function makeProduct(overrides: Record<string, unknown> = {}) {
  const slug = `product-${Date.now()}-${Math.random()}`;
  return {
    slug, nameEn: 'Test Sofa', nameAr: 'أريكة', price: 2500,
    category: { main: 'living' }, stock: 10, images: ['https://img.test/1.jpg'],
    isActive: true, isFeatured: false, rating: 0, reviewCount: 0,
    colors: [], tags: [], sku: `HEM-${slug}`,
    ...overrides,
  };
}

describe('listProducts', () => {
  it('returns active products only', async () => {
    await Product.create(makeProduct({ isActive: true }));
    await Product.create(makeProduct({ isActive: false, slug: 'inactive' }));
    const { products } = await listProducts({});
    expect(products).toHaveLength(1);
    expect(products[0].isActive).toBe(true);
  });

  it('filters by category', async () => {
    await Product.create(makeProduct({ category: { main: 'living' } }));
    await Product.create(makeProduct({ category: { main: 'bedroom' }, slug: 'bed-p', sku: 'HEM-bed' }));
    const { products } = await listProducts({ category: 'living' });
    expect(products).toHaveLength(1);
    expect((products[0].category as { main: string }).main).toBe('living');
  });

  it('filters by featured flag', async () => {
    await Product.create(makeProduct({ isFeatured: true }));
    await Product.create(makeProduct({ isFeatured: false, slug: 'not-feat', sku: 'HEM-nf' }));
    const { products } = await listProducts({ featured: true });
    expect(products).toHaveLength(1);
  });

  it('filters in-stock only', async () => {
    await Product.create(makeProduct({ stock: 0, slug: 'oos', sku: 'HEM-oos' }));
    await Product.create(makeProduct({ stock: 5, slug: 'in-s', sku: 'HEM-ins' }));
    const { products } = await listProducts({ inStock: true });
    expect(products).toHaveLength(1);
    expect(products[0].stock).toBeGreaterThan(0);
  });

  it('filters by price range', async () => {
    await Product.create(makeProduct({ price: 1000, slug: 'cheap', sku: 'HEM-ch' }));
    await Product.create(makeProduct({ price: 5000, slug: 'expen', sku: 'HEM-ex' }));
    const { products } = await listProducts({ minPrice: 2000, maxPrice: 6000 });
    expect(products).toHaveLength(1);
    expect(products[0].price).toBe(5000);
  });

  it('returns correct pagination', async () => {
    const items = Array.from({ length: 15 }, (_, i) =>
      makeProduct({ slug: `p-${i}`, sku: `HEM-${i}`, price: 1000 + i * 100 })
    );
    await Product.insertMany(items);
    const { pagination } = await listProducts({ page: 1, limit: 6 });
    expect(pagination.total).toBe(15);
    expect(pagination.pages).toBe(3);
  });

  it('returns facets with brand list', async () => {
    await Product.create(makeProduct({ brand: 'BrandA' }));
    await Product.create(makeProduct({ brand: 'BrandB', slug: 'b2', sku: 'HEM-b2' }));
    const { facets } = await listProducts({});
    expect(facets.brands).toContain('BrandA');
    expect(facets.brands).toContain('BrandB');
  });
});

describe('getProduct', () => {
  it('finds by slug', async () => {
    await Product.create(makeProduct({ slug: 'my-sofa' }));
    const p = await getProduct('my-sofa');
    expect(p).not.toBeNull();
    expect(p!.slug).toBe('my-sofa');
  });

  it('finds by id', async () => {
    const created = await Product.create(makeProduct());
    const p       = await getProduct(created._id.toString());
    expect(p).not.toBeNull();
  });

  it('returns null for nonexistent slug', async () => {
    const p = await getProduct('does-not-exist-xyz');
    expect(p).toBeNull();
  });
});

describe('invalidateProductCache', () => {
  it('runs without error (with or without Redis)', async () => {
    await expect(invalidateProductCache()).resolves.toBeUndefined();
    await expect(invalidateProductCache('abc123')).resolves.toBeUndefined();
  });
});
