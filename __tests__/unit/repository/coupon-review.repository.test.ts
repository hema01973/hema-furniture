// __tests__/unit/repository/coupon-review.repository.test.ts — HemaV048
// Unit tests for MongoCouponRepository and MongoReviewRepository.

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoCouponRepository } from '@/infrastructure/repositories/MongoCouponRepository';
import { MongoReviewRepository  } from '@/infrastructure/repositories/MongoReviewRepository';

let mongod: MongoMemoryServer;
let couponRepo: MongoCouponRepository;
let reviewRepo: MongoReviewRepository;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  couponRepo = new MongoCouponRepository();
  reviewRepo = new MongoReviewRepository();
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

// ── CouponRepository ──────────────────────────────────────────────────────────

describe('MongoCouponRepository', () => {
  it('findById returns null for unknown id', async () => {
    expect(await couponRepo.findById(new mongoose.Types.ObjectId().toString())).toBeNull();
  });

  it('findById returns null for invalid ObjectId', async () => {
    expect(await couponRepo.findById('bad-id')).toBeNull();
  });

  it('findByCode returns null for unknown code', async () => {
    expect(await couponRepo.findByCode('NOTEXIST')).toBeNull();
  });

  it('findAll returns empty paginated result', async () => {
    const result = await couponRepo.findAll({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('findAll with isActive filter returns empty result', async () => {
    const result = await couponRepo.findAll({ isActive: true, page: 1, limit: 10 });
    expect(result.items).toHaveLength(0);
  });

  it('atomicClaim returns null for unknown coupon', async () => {
    const result = await couponRepo.atomicClaim(
      new mongoose.Types.ObjectId().toString(),
    );
    expect(result).toBeNull();
  });

  it('deactivate returns false for missing coupon', async () => {
    expect(await couponRepo.deactivate(new mongoose.Types.ObjectId().toString())).toBe(false);
  });

  it('delete returns false for missing coupon', async () => {
    expect(await couponRepo.delete(new mongoose.Types.ObjectId().toString())).toBe(false);
  });

  it('implements ICouponRepository interface fully', () => {
    expect(typeof couponRepo.findById).toBe('function');
    expect(typeof couponRepo.findByCode).toBe('function');
    expect(typeof couponRepo.findAll).toBe('function');
    expect(typeof couponRepo.save).toBe('function');
    expect(typeof couponRepo.delete).toBe('function');
    expect(typeof couponRepo.atomicClaim).toBe('function');
    expect(typeof couponRepo.deactivate).toBe('function');
  });
});

// ── ReviewRepository ──────────────────────────────────────────────────────────

describe('MongoReviewRepository', () => {
  it('findById returns null for unknown id', async () => {
    expect(await reviewRepo.findById(new mongoose.Types.ObjectId().toString())).toBeNull();
  });

  it('findById returns null for invalid ObjectId', async () => {
    expect(await reviewRepo.findById('bad-id')).toBeNull();
  });

  it('findAll returns empty paginated result', async () => {
    const result = await reviewRepo.findAll({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('findAll with isApproved filter returns empty result', async () => {
    const result = await reviewRepo.findAll({ isApproved: false, page: 1, limit: 10 });
    expect(result.items).toHaveLength(0);
  });

  it('findByProductId returns empty result for unknown product', async () => {
    const result = await reviewRepo.findByProductId(
      new mongoose.Types.ObjectId().toString(),
      { page: 1, limit: 10 },
    );
    expect(result.items).toHaveLength(0);
  });

  it('approve returns null for missing review', async () => {
    expect(await reviewRepo.approve(new mongoose.Types.ObjectId().toString())).toBeNull();
  });

  it('reject returns false for missing review', async () => {
    expect(await reviewRepo.reject(new mongoose.Types.ObjectId().toString())).toBe(false);
  });

  it('incrementHelpful returns null for missing review', async () => {
    expect(await reviewRepo.incrementHelpful(new mongoose.Types.ObjectId().toString())).toBeNull();
  });

  it('delete returns false for missing review', async () => {
    expect(await reviewRepo.delete(new mongoose.Types.ObjectId().toString())).toBe(false);
  });

  it('implements IReviewRepository interface fully', () => {
    expect(typeof reviewRepo.findById).toBe('function');
    expect(typeof reviewRepo.findAll).toBe('function');
    expect(typeof reviewRepo.findByProductId).toBe('function');
    expect(typeof reviewRepo.save).toBe('function');
    expect(typeof reviewRepo.delete).toBe('function');
    expect(typeof reviewRepo.approve).toBe('function');
    expect(typeof reviewRepo.reject).toBe('function');
    expect(typeof reviewRepo.incrementHelpful).toBe('function');
  });
});
