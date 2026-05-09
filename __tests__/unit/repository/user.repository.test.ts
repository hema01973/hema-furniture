// __tests__/unit/repository/user.repository.test.ts — HemaV048
// Unit tests for MongoUserRepository using mongodb-memory-server.

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoUserRepository } from '@/infrastructure/repositories/MongoUserRepository';

let mongod: MongoMemoryServer;
let repo: MongoUserRepository;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  repo = new MongoUserRepository();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

describe('MongoUserRepository', () => {
  it('findById returns null for unknown id', async () => {
    const result = await repo.findById(new mongoose.Types.ObjectId().toString());
    expect(result).toBeNull();
  });

  it('findById returns null for invalid ObjectId', async () => {
    const result = await repo.findById('invalid-id');
    expect(result).toBeNull();
  });

  it('findByEmail returns null for unknown email', async () => {
    const result = await repo.findByEmail('nobody@example.com');
    expect(result).toBeNull();
  });

  it('findAll returns empty paginated result', async () => {
    const result = await repo.findAll({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('findAll with role filter returns empty result', async () => {
    const result = await repo.findAll({ role: 'admin', page: 1, limit: 10 });
    expect(result.items).toHaveLength(0);
  });

  it('findAll with search filter returns empty result', async () => {
    const result = await repo.findAll({ search: 'Ahmed', page: 1, limit: 10 });
    expect(result.items).toHaveLength(0);
  });

  it('updateRole returns null for missing user', async () => {
    const result = await repo.updateRole(new mongoose.Types.ObjectId().toString(), 'admin');
    expect(result).toBeNull();
  });

  it('toggleWishlist throws for missing user', async () => {
    await expect(
      repo.toggleWishlist(
        new mongoose.Types.ObjectId().toString(),
        new mongoose.Types.ObjectId().toString(),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('findByPasswordResetToken returns null for invalid token', async () => {
    const result = await repo.findByPasswordResetToken('invalid-token-hash');
    expect(result).toBeNull();
  });

  it('implements IUserRepository interface fully', () => {
    expect(typeof repo.findById).toBe('function');
    expect(typeof repo.findByEmail).toBe('function');
    expect(typeof repo.findAll).toBe('function');
    expect(typeof repo.save).toBe('function');
    expect(typeof repo.delete).toBe('function');
    expect(typeof repo.updateRole).toBe('function');
    expect(typeof repo.toggleWishlist).toBe('function');
    expect(typeof repo.setPasswordReset).toBe('function');
    expect(typeof repo.findByPasswordResetToken).toBe('function');
    expect(typeof repo.clearPasswordReset).toBe('function');
    expect(typeof repo.incrementFailedLogins).toBe('function');
    expect(typeof repo.lockUntil).toBe('function');
    expect(typeof repo.resetFailedLogins).toBe('function');
  });
});
