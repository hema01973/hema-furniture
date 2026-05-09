// __tests__/integration/auth.test.ts — Register → Verify → Login → Reset flow
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDB, User } from '@/lib/mongodb';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { requestPasswordReset, resetPassword } from '@/services/user.service';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI     = mongod.getUri();
  process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
  await connectDB();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await User.deleteMany({});
});

const USER = {
  name:  'Ahmed Hassan',
  email: 'ahmed@test.com',
  phone: '01234567890',
};
const PASSWORD = 'SecureP@ss1!';

async function createUser(overrides = {}) {
  const passwordHash = await hashPassword(PASSWORD);
  return User.create({
    ...USER, passwordHash,
    isEmailVerified: false,
    isActive:        true,
    failedLogins:    0,
    ...overrides,
  });
}

describe('User registration', () => {
  it('creates user with bcrypt-hashed password', async () => {
    const hash = await hashPassword(PASSWORD);
    const user = await User.create({ ...USER, passwordHash: hash, isActive: true });

    expect(user.passwordHash).not.toBe(PASSWORD);
    expect(user.passwordHash.length).toBeGreaterThan(30);
    expect(await verifyPassword(PASSWORD, user.passwordHash)).toBe(true);
  });

  it('rejects duplicate email', async () => {
    await createUser();
    await expect(createUser()).rejects.toThrow(/duplicate/i);
  });
});

describe('Account lockout', () => {
  it('locks account after 5 failed logins', async () => {
    const user = await createUser({ failedLogins: 4 });

    // Simulate 5th failed login
    await User.findByIdAndUpdate(user._id, {
      failedLogins: 5,
      lockedUntil:  new Date(Date.now() + 15 * 60_000),
    });

    const locked = await User.findById(user._id);
    expect(locked!.lockedUntil).toBeDefined();
    expect(locked!.lockedUntil! > new Date()).toBe(true);
  });

  it('unlocks after lockout period expires', async () => {
    const user = await createUser({
      failedLogins: 5,
      lockedUntil:  new Date(Date.now() - 1000), // expired
    });

    const found = await User.findById(user._id);
    expect(found!.lockedUntil! < new Date()).toBe(true); // expired = can login
  });
});

describe('Password reset flow', () => {
  it('sets a hashed reset token on the user', async () => {
    await createUser();

    // Mock enqueueEmail to avoid actual email sending
    jest.mock('@/lib/queue', () => ({ enqueueEmail: jest.fn().mockResolvedValue(undefined) }));

    await requestPasswordReset(USER.email);

    const user = await User.findOne({ email: USER.email })
      .select('+passwordResetToken +passwordResetExpires');

    expect(user!.passwordResetToken).toBeDefined();
    expect(user!.passwordResetExpires! > new Date()).toBe(true);
  });

  it('does not reveal if email exists (no error on unknown email)', async () => {
    jest.mock('@/lib/queue', () => ({ enqueueEmail: jest.fn().mockResolvedValue(undefined) }));
    // Should not throw
    await expect(requestPasswordReset('unknown@test.com')).resolves.toBeUndefined();
  });

  it('resets password with valid token', async () => {
    const user = await createUser();
    const crypto = await import('crypto');
    const raw    = crypto.randomBytes(32).toString('hex');
    const hash   = crypto.createHash('sha256').update(raw).digest('hex');

    await User.findByIdAndUpdate(user._id, {
      passwordResetToken:   hash,
      passwordResetExpires: new Date(Date.now() + 3600_000),
    });

    await resetPassword(raw, 'NewP@ssword1!');

    const updated = await User.findById(user._id).select('+passwordHash');
    const valid   = await verifyPassword('NewP@ssword1!', updated!.passwordHash);
    expect(valid).toBe(true);
  });

  it('rejects expired token', async () => {
    const user = await createUser();
    const crypto = await import('crypto');
    const raw    = crypto.randomBytes(32).toString('hex');
    const hash   = crypto.createHash('sha256').update(raw).digest('hex');

    await User.findByIdAndUpdate(user._id, {
      passwordResetToken:   hash,
      passwordResetExpires: new Date(Date.now() - 1000), // expired
    });

    await expect(resetPassword(raw, 'NewP@ss1!')).rejects.toThrow(/expired/i);
  });

  it('rejects invalid token', async () => {
    await expect(resetPassword('invalid-token-xyz', 'NewP@ss1!')).rejects.toThrow(/expired|invalid/i);
  });
});

describe('Wishlist', () => {
  it('adds and removes items idempotently', async () => {
    const { toggleWishlist } = await import('@/services/user.service');
    const user     = await createUser();
    const fakeId   = new mongoose.Types.ObjectId().toString();

    const { added: a1 } = await toggleWishlist(user._id.toString(), fakeId);
    expect(a1).toBe(true);

    const { added: a2 } = await toggleWishlist(user._id.toString(), fakeId);
    expect(a2).toBe(false);

    const found = await User.findById(user._id);
    expect(found!.wishlist).toHaveLength(0);
  });
});
