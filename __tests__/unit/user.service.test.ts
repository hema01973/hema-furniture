// __tests__/unit/user.service.test.ts — V016
// Unit tests for src/services/user.service.ts
// Covers: getUserById, updateUser, requestPasswordReset, resetPassword, toggleWishlist

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// ── Mocks ─────────────────────────────────────────────────────────
jest.mock('../../src/lib/queue', () => ({
  enqueueEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/lib/sanitize', () => ({
  sanitize:      (v: unknown) => String(v ?? '').trim(),
  sanitizeEmail: (v: unknown) => String(v ?? '').trim().toLowerCase(),
}));

// ── DB setup ──────────────────────────────────────────────────────
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
  // Clean all collections between tests
  await mongoose.connection.db?.dropDatabase();
  // Reset module-level DB singleton so connectDB reconnects properly
  jest.resetModules();
});

// ── Helpers ───────────────────────────────────────────────────────
import { hashPassword } from '../../src/lib/auth';
import { User, Product } from '../../src/lib/mongodb';

async function createUser(overrides: Partial<{
  email: string; name: string; passwordHash: string; isActive: boolean;
}> = {}) {
  const hash = await hashPassword('Password1!');
  return User.create({
    email:        overrides.email        ?? 'test@example.com',
    name:         overrides.name         ?? 'Test User',
    passwordHash: overrides.passwordHash ?? hash,
    isActive:     overrides.isActive     ?? true,
  });
}

// ── getUserById ───────────────────────────────────────────────────
describe('getUserById', () => {
  it('returns the user when found', async () => {
    const { getUserById } = await import('../../src/services/user.service');
    const user = await createUser();
    const found = await getUserById(user._id.toString());
    expect(found).not.toBeNull();
    expect(found?.email).toBe('test@example.com');
  });

  it('returns null for unknown id', async () => {
    const { getUserById } = await import('../../src/services/user.service');
    const found = await getUserById(new mongoose.Types.ObjectId().toString());
    expect(found).toBeNull();
  });
});

// ── updateUser ────────────────────────────────────────────────────
describe('updateUser', () => {
  it('updates name and phone', async () => {
    const { updateUser } = await import('../../src/services/user.service');
    const user = await createUser();
    const updated = await updateUser(user._id.toString(), {
      name:  'New Name',
      phone: '01012345678',
    });
    expect(updated.name).toBe('New Name');
    expect(updated.phone).toBe('01012345678');
  });

  it('throws 404 for unknown id', async () => {
    const { updateUser } = await import('../../src/services/user.service');
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(updateUser(fakeId, { name: 'X' }))
      .rejects.toMatchObject({ status: 404 });
  });
});

// ── requestPasswordReset ──────────────────────────────────────────
describe('requestPasswordReset', () => {
  it('sets reset token for existing active user', async () => {
    const { requestPasswordReset } = await import('../../src/services/user.service');
    const user = await createUser();
    await requestPasswordReset(user.email);
    const updated = await User
      .findById(user._id)
      .select('+passwordResetToken +passwordResetExpires');
    expect(updated?.passwordResetToken).toBeTruthy();
    expect(updated?.passwordResetExpires?.getTime()).toBeGreaterThan(Date.now());
  });

  it('silently skips unknown email (no information leak)', async () => {
    const { requestPasswordReset } = await import('../../src/services/user.service');
    // Should not throw
    await expect(requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();
  });

  it('silently skips inactive user', async () => {
    const { requestPasswordReset } = await import('../../src/services/user.service');
    const user = await createUser({ email: 'inactive@example.com', isActive: false });
    await requestPasswordReset(user.email);
    const updated = await User
      .findById(user._id)
      .select('+passwordResetToken');
    expect(updated?.passwordResetToken).toBeFalsy();
  });
});

// ── resetPassword ─────────────────────────────────────────────────
describe('resetPassword', () => {
  it('resets password with valid token', async () => {
    const crypto = await import('crypto');
    const { requestPasswordReset, resetPassword } = await import('../../src/services/user.service');
    const user = await createUser();

    // Trigger reset to get a raw token via the queue mock
    const { enqueueEmail } = await import('../../src/lib/queue');
    let capturedToken: string | undefined;
    (enqueueEmail as jest.Mock).mockImplementationOnce(async (job: { token?: string }) => {
      capturedToken = job.token;
    });

    await requestPasswordReset(user.email);
    expect(capturedToken).toBeTruthy();

    await resetPassword(capturedToken!, 'NewPassword1!');
    const updated = await User.findById(user._id).select('+passwordResetToken');
    expect(updated?.passwordResetToken).toBeFalsy();
  });

  it('throws 400 for invalid token', async () => {
    const { resetPassword } = await import('../../src/services/user.service');
    await expect(resetPassword('bad-token', 'Anything1!'))
      .rejects.toMatchObject({ status: 400 });
  });
});

// ── toggleWishlist ────────────────────────────────────────────────
describe('toggleWishlist', () => {
  it('adds product to wishlist', async () => {
    const { toggleWishlist } = await import('../../src/services/user.service');
    const user    = await createUser();
    const product = await Product.create({
      name: 'Sofa', slug: 'sofa', price: 5000,
      images: ['img.jpg'], stock: 10,
      category: { main: 'living', sub: 'sofas' },
    });

    const result = await toggleWishlist(user._id.toString(), product._id.toString());
    expect(result.added).toBe(true);

    const updated = await User.findById(user._id);
    expect(updated?.wishlist.map(String)).toContain(product._id.toString());
  });

  it('removes product when already in wishlist (toggle)', async () => {
    const { toggleWishlist } = await import('../../src/services/user.service');
    const user    = await createUser();
    const product = await Product.create({
      name: 'Chair', slug: 'chair', price: 2000,
      images: ['img.jpg'], stock: 5,
      category: { main: 'living', sub: 'armchairs' },
    });

    await toggleWishlist(user._id.toString(), product._id.toString()); // add
    const result = await toggleWishlist(user._id.toString(), product._id.toString()); // remove
    expect(result.added).toBe(false);

    const updated = await User.findById(user._id);
    expect(updated?.wishlist.map(String)).not.toContain(product._id.toString());
  });
});
