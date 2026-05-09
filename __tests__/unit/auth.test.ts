// __tests__/unit/auth.test.ts
import { hashPassword, verifyPassword } from '@/lib/auth';

describe('Password hashing (@node-rs/bcrypt)', () => {
  const TEST_PASSWORD = 'SecureP@ss123!';

  it('hashes a password (returns non-empty string)', async () => {
    const hash = await hashPassword(TEST_PASSWORD);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
    expect(hash).not.toBe(TEST_PASSWORD);
  });

  it('produces different hashes for the same password (salting)', async () => {
    const h1 = await hashPassword(TEST_PASSWORD);
    const h2 = await hashPassword(TEST_PASSWORD);
    expect(h1).not.toBe(h2);
  });

  it('verifies correct password', async () => {
    const hash  = await hashPassword(TEST_PASSWORD);
    const valid = await verifyPassword(TEST_PASSWORD, hash);
    expect(valid).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash  = await hashPassword(TEST_PASSWORD);
    const valid = await verifyPassword('WrongPassword!1', hash);
    expect(valid).toBe(false);
  });

  it('rejects empty password', async () => {
    const hash  = await hashPassword(TEST_PASSWORD);
    const valid = await verifyPassword('', hash);
    expect(valid).toBe(false);
  });
});
