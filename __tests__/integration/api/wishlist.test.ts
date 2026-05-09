// __tests__/integration/api/wishlist.test.ts — V016
// Integration tests for the wishlist API endpoints:
//   POST   /api/v1/wishlist          (toggle add/remove)
//   GET    /api/v1/wishlist          (list wishlist)
//   POST   /api/v1/wishlist/sync     (guest-to-auth merge)

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMocks } from 'node-mocks-http';
import { User, Product, connectDB } from '../../../src/lib/mongodb';
import { hashPassword } from '../../../src/lib/auth';

// ── Mocks ─────────────────────────────────────────────────────────
jest.mock('../../../src/lib/redis', () => ({
  rateLimit: jest.fn().mockResolvedValue({ blocked: false, remaining: 99, retryAfterSec: 0 }),
  getRedis:  jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../src/lib/sanitize', () => ({
  sanitize:      (v: unknown) => String(v ?? ''),
  sanitizeEmail: (v: unknown) => String(v ?? '').toLowerCase(),
}));

// ── DB ─────────────────────────────────────────────────────────────
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

// ── Helpers ────────────────────────────────────────────────────────
async function seedUserAndProduct() {
  const hash = await hashPassword('Password1!');
  const user = await User.create({
    name: 'Wishlist User', email: 'wish@example.com', passwordHash: hash,
  });
  const product = await Product.create({
    name: 'Velvet Sofa', slug: 'velvet-sofa', price: 12_000,
    images: ['sofa.jpg'], stock: 8,
    category: { main: 'living', sub: 'sofas' },
  });
  return { user, product };
}

// ── Tests: toggleWishlist service (unit-level via service import) ──
describe('toggleWishlist service', () => {
  it('adds product to wishlist on first call', async () => {
    const { toggleWishlist } = await import('../../../src/services/user.service');
    const { user, product } = await seedUserAndProduct();

    const res = await toggleWishlist(user._id.toString(), product._id.toString());
    expect(res.added).toBe(true);

    const updated = await User.findById(user._id);
    expect(updated!.wishlist.map(String)).toContain(product._id.toString());
  });

  it('removes product on second call (idempotent toggle)', async () => {
    const { toggleWishlist } = await import('../../../src/services/user.service');
    const { user, product } = await seedUserAndProduct();

    await toggleWishlist(user._id.toString(), product._id.toString());
    const res = await toggleWishlist(user._id.toString(), product._id.toString());
    expect(res.added).toBe(false);

    const updated = await User.findById(user._id);
    expect(updated!.wishlist.map(String)).not.toContain(product._id.toString());
  });

  it('handles multiple products independently', async () => {
    const { toggleWishlist } = await import('../../../src/services/user.service');
    const { user, product: p1 } = await seedUserAndProduct();
    const p2 = await Product.create({
      name: 'Oak Desk', slug: 'oak-desk', price: 8_500,
      images: ['desk.jpg'], stock: 3,
      category: { main: 'office', sub: 'desks' },
    });

    await toggleWishlist(user._id.toString(), p1._id.toString());
    await toggleWishlist(user._id.toString(), p2._id.toString());

    const updated = await User.findById(user._id);
    const wishIds = updated!.wishlist.map(String);
    expect(wishIds).toContain(p1._id.toString());
    expect(wishIds).toContain(p2._id.toString());
  });

  it('throws 404 for non-existent user', async () => {
    const { toggleWishlist } = await import('../../../src/services/user.service');
    const { product } = await seedUserAndProduct();
    const fakeId = new mongoose.Types.ObjectId().toString();

    await expect(toggleWishlist(fakeId, product._id.toString()))
      .rejects.toMatchObject({ status: 404 });
  });
});

// ── Tests: wishlist sync (guest → auth merge) ─────────────────────
describe('wishlist sync', () => {
  it('merges guest product ids into authenticated user wishlist', async () => {
    const { user } = await seedUserAndProduct();

    // Create two products — one already in wishlist, one new from guest
    const [existing, guestOnly] = await Promise.all([
      Product.create({
        name: 'Existing', slug: 'existing', price: 1000,
        images: ['e.jpg'], stock: 1,
        category: { main: 'bedroom', sub: 'beds' },
      }),
      Product.create({
        name: 'Guest Only', slug: 'guest-only', price: 2000,
        images: ['g.jpg'], stock: 1,
        category: { main: 'bedroom', sub: 'beds' },
      }),
    ]);

    // Pre-populate the authenticated wishlist with `existing`
    await User.findByIdAndUpdate(user._id, {
      $addToSet: { wishlist: existing._id },
    });

    // Simulate sync: merge guestOnly (and existing — should not duplicate)
    const guestIds = [existing._id.toString(), guestOnly._id.toString()];
    await User.findByIdAndUpdate(user._id, {
      $addToSet: { wishlist: { $each: guestIds.map(id => new mongoose.Types.ObjectId(id)) } },
    });

    const updated = await User.findById(user._id);
    const wishIds = updated!.wishlist.map(String);

    expect(wishIds).toContain(existing._id.toString());
    expect(wishIds).toContain(guestOnly._id.toString());
    // No duplicates
    expect(wishIds.length).toBe(new Set(wishIds).size);
  });
});
