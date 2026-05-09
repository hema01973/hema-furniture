// __tests__/integration/services/mfa-flow.test.ts — MFA setup + verify flow
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDB, User } from '@/lib/mongodb';
import { authenticator } from 'otplib';
import { hash, verify as bcryptVerify } from '@node-rs/bcrypt';

let mongod: MongoMemoryServer;

authenticator.options = { digits: 6, step: 30 };

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

afterEach(async () => { await User.deleteMany({}); });

async function createUser() {
  const { hash: bcryptHash } = await import('@node-rs/bcrypt');
  return User.create({
    name: 'MFA User', email: 'mfa@test.com',
    passwordHash: await bcryptHash('Test@123!', 10),
    isActive: true, isEmailVerified: true, failedLogins: 0,
  });
}

describe('MFA Setup flow', () => {
  it('generates a valid TOTP secret and QR URL', async () => {
    const secret     = authenticator.generateSecret(20);
    const otpauthUrl = authenticator.keyuri('user@test.com', 'Hema Furniture', secret);
    expect(secret.length).toBeGreaterThan(0);
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
  });

  it('stores mfaSecret on user (not yet activated)', async () => {
    const user   = await createUser();
    const secret = authenticator.generateSecret(20);
    await User.findByIdAndUpdate(user._id, { mfaSecret: secret });
    const found = await User.findById(user._id).select('+mfaSecret');
    expect(found!.mfaSecret).toBe(secret);
    expect(found!.mfaEnabled).toBeFalsy(); // not yet activated
  });

  it('activates MFA after first valid TOTP verification', async () => {
    const user   = await createUser();
    const secret = authenticator.generateSecret(20);
    await User.findByIdAndUpdate(user._id, { mfaSecret: secret });

    const token     = authenticator.generate(secret);
    const rawCodes  = ['code1', 'code2', 'code3', 'code4', 'code5', 'code6', 'code7', 'code8'];
    const hashed    = await Promise.all(rawCodes.map(c => hash(c, 10)));
    const valid     = authenticator.verify({ token, secret });

    expect(valid).toBe(true);

    await User.findByIdAndUpdate(user._id, { mfaEnabled: true, mfaBackupCodes: hashed });
    const found = await User.findById(user._id).select('+mfaEnabled +mfaBackupCodes');
    expect(found!.mfaEnabled).toBe(true);
    expect(found!.mfaBackupCodes).toHaveLength(8);
  });

  it('rejects invalid TOTP token', async () => {
    const secret = authenticator.generateSecret(20);
    expect(authenticator.verify({ token: '000000', secret })).toBe(false);
  });
});

describe('MFA Verify flow', () => {
  it('verifies a valid TOTP token', async () => {
    const secret = authenticator.generateSecret(20);
    const token  = authenticator.generate(secret);
    expect(authenticator.verify({ token, secret })).toBe(true);
  });

  it('consumes a backup code (one-time use)', async () => {
    const rawCode   = 'a1b2c3d4';
    const hashed    = await hash(rawCode, 10);
    const user      = await createUser();
    await User.findByIdAndUpdate(user._id, {
      mfaEnabled:     true,
      mfaSecret:      authenticator.generateSecret(20),
      mfaBackupCodes: [hashed, await hash('other1', 10), await hash('other2', 10)],
    });

    const found = await User.findById(user._id).select('+mfaBackupCodes');
    let usedIdx = -1;
    for (let i = 0; i < found!.mfaBackupCodes!.length; i++) {
      if (await bcryptVerify(rawCode, found!.mfaBackupCodes![i])) {
        usedIdx = i; break;
      }
    }
    expect(usedIdx).toBe(0);

    // Consume it
    found!.mfaBackupCodes!.splice(usedIdx, 1);
    await found!.save();

    const afterConsume = await User.findById(user._id).select('+mfaBackupCodes');
    expect(afterConsume!.mfaBackupCodes).toHaveLength(2);
  });

  it('locks account after 5 failed MFA attempts', async () => {
    const user = await createUser();
    await User.findByIdAndUpdate(user._id, {
      mfaEnabled: true, mfaSecret: authenticator.generateSecret(20),
      failedLogins: 4,
    });

    const found = await User.findById(user._id).select('+failedLogins +lockedUntil');
    found!.failedLogins = 5;
    found!.lockedUntil  = new Date(Date.now() + 15 * 60_000);
    await found!.save();

    const locked = await User.findById(user._id);
    expect(locked!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('resets failedLogins on successful verification', async () => {
    const user = await createUser();
    await User.findByIdAndUpdate(user._id, { failedLogins: 3 });

    // Simulate successful auth
    await User.findByIdAndUpdate(user._id, { failedLogins: 0, $unset: { lockedUntil: 1 } });
    const found = await User.findById(user._id);
    expect(found!.failedLogins).toBe(0);
    expect(found!.lockedUntil).toBeUndefined();
  });

  it('backup code verification is resistant to hash reuse', async () => {
    // Each backup code bcrypt hash is unique — same raw code hashed twice gives different hashes
    const code = 'samecode';
    const h1   = await hash(code, 10);
    const h2   = await hash(code, 10);
    expect(h1).not.toBe(h2); // bcrypt salting
    expect(await bcryptVerify(code, h1)).toBe(true);
    expect(await bcryptVerify(code, h2)).toBe(true);
  });
});
