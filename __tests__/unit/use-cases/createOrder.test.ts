// __tests__/unit/use-cases/createOrder.test.ts — V049
// TEST-GAP-01 FIX: unit tests for CreateOrderUseCase — the most critical
// untested code path (idempotency, stock validation, coupon, ACID rollback).

import { createOrderUseCase, type CreateOrderInput } from '@/application/use-cases/CreateOrderUseCase';

// ── Mock all external dependencies ──────────────────────────────────────────
const mockOrderRepo = {
  findByIdempotencyKey: jest.fn(),
  save: jest.fn(),
};

const mockProductRepo = {
  findByIds: jest.fn(),
  decrementStock: jest.fn(),
};

const mockCouponRepo = {
  findActiveByCode: jest.fn(),
  claimCoupon: jest.fn(),
};

jest.mock('@/infrastructure/repositories', () => ({
  orderRepository:   mockOrderRepo,
  productRepository: mockProductRepo,
  couponRepository:  mockCouponRepo,
}));

const mockStartSession = {
  startTransaction:  jest.fn(),
  commitTransaction: jest.fn(),
  abortTransaction:  jest.fn(),
  endSession:        jest.fn(),
  inTransaction:     jest.fn(() => false),
};

jest.mock('mongoose', () => ({
  ...jest.requireActual('mongoose'),
  startSession: jest.fn(() => Promise.resolve(mockStartSession)),
}));

jest.mock('@/lib/auth', () => ({
  getAuthSession: jest.fn(() => Promise.resolve(null)), // guest user by default
}));

// ── Test data helpers ────────────────────────────────────────────────────────
function makeInput(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    customer: {
      firstName: 'Ahmed',
      lastName:  'Hassan',
      email:     'ahmed@example.com',
      phone:     '01012345678',
    },
    shippingAddress: {
      street:      '123 Tahrir Square',
      city:        'Cairo',
      governorate: 'Cairo',
    },
    items: [{ productId: 'prod1', quantity: 2 }],
    paymentMethod: 'cod',
    ...overrides,
  };
}

function makeProduct(overrides = {}) {
  return {
    id:      'prod1',
    nameEn:  'Modern Sofa',
    nameAr:  'كنبة عصرية',
    price:   1500,
    stock:   10,
    images:  ['https://example.com/sofa.jpg'],
    ...overrides,
  };
}

function makeSavedOrder(overrides = {}) {
  return {
    id:              'order-id-123',
    orderNumber:     'HEM-2026-00001',
    userId:          undefined,
    guestEmail:      'ahmed@example.com',
    customer:        makeInput().customer,
    shippingAddress: makeInput().shippingAddress,
    items:           [],
    subtotal:        3000,
    shipping:        0,
    discount:        0,
    total:           3000,
    paymentMethod:   'cod',
    status:          'confirmed',
    paymentStatus:   'pending',
    createdAt:       new Date(),
    updatedAt:       new Date(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  mockStartSession.inTransaction.mockReturnValue(false);
  mockProductRepo.findByIds.mockResolvedValue([makeProduct()]);
  mockProductRepo.decrementStock.mockResolvedValue(true);
  mockOrderRepo.findByIdempotencyKey.mockResolvedValue(null);
  mockCouponRepo.findActiveByCode.mockResolvedValue(null);
  mockOrderRepo.save.mockResolvedValue(makeSavedOrder());
});

describe('CreateOrderUseCase', () => {
  // ── Idempotency ───────────────────────────────────────────────────────────
  describe('idempotency', () => {
    it('returns existing order on idempotency key replay', async () => {
      const existing = makeSavedOrder({ idempotencyKey: 'key-123', paymentMethod: 'cod' });
      mockOrderRepo.findByIdempotencyKey.mockResolvedValue(existing);

      const result = await createOrderUseCase(makeInput({ idempotencyKey: 'key-123' }));

      expect(result.orderNumber).toBe(existing.orderNumber);
      expect(result.orderId).toBe(existing.id);
      // Should NOT call product repo or save again
      expect(mockProductRepo.findByIds).not.toHaveBeenCalled();
      expect(mockOrderRepo.save).not.toHaveBeenCalled();
    });

    it('skips idempotency check when no key is provided', async () => {
      await createOrderUseCase(makeInput());
      expect(mockOrderRepo.findByIdempotencyKey).not.toHaveBeenCalled();
    });
  });

  // ── Phone validation ──────────────────────────────────────────────────────
  describe('phone validation (WEAK-ARCH-02)', () => {
    it('rejects invalid Egyptian phone number', async () => {
      await expect(
        createOrderUseCase(makeInput({ customer: { ...makeInput().customer, phone: '0912345678' } }))
      ).rejects.toThrow('Invalid Egyptian phone number');
    });

    it('accepts and normalizes valid phone number', async () => {
      const result = await createOrderUseCase(makeInput({ customer: { ...makeInput().customer, phone: '01012345678' } }));
      expect(result.customer.phone).toBe('+201012345678');
    });
  });

  // ── Stock validation ──────────────────────────────────────────────────────
  describe('stock validation', () => {
    it('throws when product is unavailable', async () => {
      mockProductRepo.findByIds.mockResolvedValue([]); // no products found

      await expect(createOrderUseCase(makeInput())).rejects.toMatchObject({
        message: expect.stringContaining('unavailable'),
        status:  404,
      });
    });

    it('throws when requested quantity exceeds stock', async () => {
      mockProductRepo.findByIds.mockResolvedValue([makeProduct({ stock: 1 })]);

      await expect(
        createOrderUseCase(makeInput({ items: [{ productId: 'prod1', quantity: 5 }] }))
      ).rejects.toMatchObject({
        message: expect.stringContaining('only has 1 units in stock'),
        status:  400,
      });
    });

    it('throws with 409 when stock decremented by concurrent request', async () => {
      mockProductRepo.decrementStock.mockResolvedValue(false);
      mockStartSession.inTransaction.mockReturnValue(true);

      await expect(createOrderUseCase(makeInput())).rejects.toMatchObject({
        status: 409,
      });
    });
  });

  // ── COD order creation ────────────────────────────────────────────────────
  describe('COD order', () => {
    it('creates a COD order with confirmed status', async () => {
      const result = await createOrderUseCase(makeInput({ paymentMethod: 'cod' }));

      expect(result.isOnline).toBe(false);
      expect(result.paymentMethod).toBe('cod');
      expect(mockOrderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod: 'cod', status: 'confirmed' })
      );
    });

    it('calculates correct total for 2x 1500 EGP items', async () => {
      const result = await createOrderUseCase(makeInput({ items: [{ productId: 'prod1', quantity: 2 }] }));
      // subtotal = 3000, shipping = 0 (above free threshold), total = 3000
      expect(result.subtotal).toBe(3000);
      expect(result.total).toBe(3000);
    });
  });

  // ── Online payment order ──────────────────────────────────────────────────
  describe('online payment order', () => {
    it('creates a paymob order with pending status', async () => {
      mockOrderRepo.save.mockResolvedValue(makeSavedOrder({ paymentMethod: 'paymob', status: 'pending' }));

      const result = await createOrderUseCase(makeInput({ paymentMethod: 'paymob' }));
      expect(result.isOnline).toBe(true);
    });

    it('downgrades paymob to cod when total is zero (100% coupon)', async () => {
      // If a coupon makes total = 0, online payment is meaningless → fallback to COD
      mockCouponRepo.findActiveByCode.mockResolvedValue({
        id:            'coupon-1',
        type:          'percentage',
        value:         100,
        minOrderValue: 0,
        maxUses:       null,
        usedCount:     0,
        usedBy:        [],
        perUserLimit:  1,
        expiresAt:     null,
        isActive:      true,
      });
      mockCouponRepo.claimCoupon.mockResolvedValue({ type: 'percentage', value: 100 });

      const result = await createOrderUseCase(makeInput({ paymentMethod: 'paymob', couponCode: 'FREE100' }));
      expect(result.paymentMethod).toBe('cod');
      expect(result.isOnline).toBe(false);
    });
  });

  // ── Unsupported payment methods ───────────────────────────────────────────
  describe('unsupported payment methods', () => {
    it.each(['fawry', 'valu'])('throws 501 for %s payment method', async (method) => {
      await expect(
        createOrderUseCase(makeInput({ paymentMethod: method as 'fawry' | 'valu' }))
      ).rejects.toMatchObject({ status: 501 });
    });
  });

  // ── Transaction rollback ──────────────────────────────────────────────────
  describe('transaction rollback', () => {
    it('aborts transaction on error', async () => {
      mockStartSession.inTransaction.mockReturnValue(true);
      mockOrderRepo.save.mockRejectedValue(new Error('DB error'));

      await expect(createOrderUseCase(makeInput())).rejects.toThrow('DB error');
      expect(mockStartSession.abortTransaction).toHaveBeenCalled();
      expect(mockStartSession.endSession).toHaveBeenCalled();
    });
  });
});
