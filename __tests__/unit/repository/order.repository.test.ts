// __tests__/unit/repository/order.repository.test.ts — HemaV048
// Unit tests for MongoOrderRepository using mongodb-memory-server.

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoOrderRepository } from '@/infrastructure/repositories/MongoOrderRepository';

let mongod: MongoMemoryServer;
let repo: MongoOrderRepository;

const mockOrderDoc = {
  orderNumber:     'ORD-TEST-001',
  userId:          new mongoose.Types.ObjectId().toString(),
  customer:        { firstName: 'Ahmed', lastName: 'Ali', email: 'ahmed@test.com', phone: '01001234567' },
  shippingAddress: { street: '123 Main', city: 'Cairo', governorate: 'Cairo' },
  items:           [{ productId: new mongoose.Types.ObjectId(), nameEn: 'Sofa', nameAr: 'كنبة', price: 5000, quantity: 1 }],
  subtotal:        5000,
  shipping:        0,
  discount:        0,
  total:           5000,
  status:          'pending',
  paymentStatus:   'pending',
  paymentMethod:   'cod',
};

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  repo = new MongoOrderRepository();
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

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('MongoOrderRepository', () => {
  it('returns null for unknown id', async () => {
    const result = await repo.findById(new mongoose.Types.ObjectId().toString());
    expect(result).toBeNull();
  });

  it('returns null for invalid ObjectId', async () => {
    const result = await repo.findById('not-an-id');
    expect(result).toBeNull();
  });

  it('findByOrderNumber returns null when not found', async () => {
    const result = await repo.findByOrderNumber('ORD-NOTEXIST');
    expect(result).toBeNull();
  });

  it('findByIdempotencyKey returns null when not found', async () => {
    const result = await repo.findByIdempotencyKey('idem-key-missing');
    expect(result).toBeNull();
  });

  it('findAll returns empty paginated result', async () => {
    const result = await repo.findAll({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('findByUserId returns empty result for unknown user', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const result = await repo.findByUserId(userId, { page: 1, limit: 10 });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('delete returns false for missing document', async () => {
    const result = await repo.delete(new mongoose.Types.ObjectId().toString());
    expect(result).toBe(false);
  });

  it('updateStatus returns null for missing document', async () => {
    const result = await repo.updateStatus(
      new mongoose.Types.ObjectId().toString(),
      'confirmed',
    );
    expect(result).toBeNull();
  });

  it('updatePaymentStatus returns null for missing document', async () => {
    const result = await repo.updatePaymentStatus(
      new mongoose.Types.ObjectId().toString(),
      'paid',
    );
    expect(result).toBeNull();
  });

  it('implements IOrderRepository interface fully', () => {
    expect(typeof repo.findById).toBe('function');
    expect(typeof repo.findByOrderNumber).toBe('function');
    expect(typeof repo.findByIdempotencyKey).toBe('function');
    expect(typeof repo.findByUserId).toBe('function');
    expect(typeof repo.findAll).toBe('function');
    expect(typeof repo.save).toBe('function');
    expect(typeof repo.delete).toBe('function');
    expect(typeof repo.updateStatus).toBe('function');
    expect(typeof repo.updatePaymentStatus).toBe('function');
  });
});
