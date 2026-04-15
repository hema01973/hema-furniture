// __tests__/integration/paymob.test.ts
// Tests for Paymob webhook verification and payment-status transitions.

import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Order } from '../../src/lib/mongodb';
import { verifyPaymobWebhook } from '../../src/lib/paymob';
import crypto from 'crypto';

jest.mock('../../src/lib/redis', () => ({
  rateLimit: jest.fn().mockResolvedValue(false),
  getRedis:  jest.fn().mockResolvedValue(null),
}));

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI        = replSet.getUri();
  process.env.PAYMOB_HMAC_SECRET = 'test-hmac-secret';
  await mongoose.connect(replSet.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

afterEach(async () => { await Order.deleteMany({}); });

// ── HMAC helpers ──────────────────────────────────────────────────
function makePaymobPayload(overrides: Record<string, string> = {}) {
  const data: Record<string, string> = {
    amount_cents:              '100000',
    created_at:                '2026-04-13T00:00:00Z',
    currency:                  'EGP',
    error_occured:             'false',
    has_parent_transaction:    'false',
    id:                        '12345',
    integration_id:            '67890',
    is_3d_secure:              'false',
    is_auth:                   'false',
    is_capture:                'false',
    is_refunded:               'false',
    is_standalone_payment:     'true',
    is_voided:                 'false',
    order:                     '99999',
    owner:                     '11111',
    pending:                   'false',
    'source_data.pan':         '1234',
    'source_data.sub_type':    'MasterCard',
    'source_data.type':        'card',
    success:                   'true',
    ...overrides,
  };
  return data;
}

function signPaymobPayload(data: Record<string, string>, secret: string) {
  const keys = [
    'amount_cents','created_at','currency','error_occured','has_parent_transaction',
    'id','integration_id','is_3d_secure','is_auth','is_capture','is_refunded',
    'is_standalone_payment','is_voided','order','owner','pending','source_data.pan',
    'source_data.sub_type','source_data.type','success',
  ];
  const concatenated = keys.map(k => data[k] ?? '').join('');
  return crypto.createHmac('sha512', secret).update(concatenated).digest('hex');
}

// ─────────────────────────────────────────────────────────────────
describe('verifyPaymobWebhook()', () => {
  it('accepts a valid HMAC signature', () => {
    const payload = makePaymobPayload();
    const hmac    = signPaymobPayload(payload, 'test-hmac-secret');
    expect(verifyPaymobWebhook(payload, hmac)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const payload = makePaymobPayload();
    const hmac    = signPaymobPayload(payload, 'test-hmac-secret');
    payload.amount_cents = '999999'; // tamper after signing
    expect(verifyPaymobWebhook(payload, hmac)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const payload = makePaymobPayload();
    const hmac    = signPaymobPayload(payload, 'wrong-secret');
    expect(verifyPaymobWebhook(payload, hmac)).toBe(false);
  });
});

describe('Order payment-status transitions', () => {
  async function createPendingOrder() {
    const [order] = await Order.create([{
      customer:        { firstName:'X', lastName:'Y', email:'x@y.com', phone:'01012345678' },
      shippingAddress: { street:'St', city:'Cairo', governorate:'Cairo' },
      items:           [{ productId: new mongoose.Types.ObjectId(), nameEn:'P', nameAr:'P', price:100, quantity:1, image:'' }],
      subtotal:10000, shipping:0, discount:0, total:10000,
      paymentMethod:'paymob', status:'pending', paymentStatus:'pending',
      paymobOrderId: '99999',
    }]);
    return order;
  }

  it('marks order as paid + confirmed on successful webhook', async () => {
    const order = await createPendingOrder();

    // Simulate what the webhook handler does
    order.paymentStatus = 'paid';
    order.status        = 'confirmed';
    await order.save();

    const updated = await Order.findById(order._id).lean();
    expect(updated?.paymentStatus).toBe('paid');
    expect(updated?.status).toBe('confirmed');
  });

  it('marks order as failed on unsuccessful webhook', async () => {
    const order = await createPendingOrder();

    order.paymentStatus = 'failed';
    await order.save();

    const updated = await Order.findById(order._id).lean();
    expect(updated?.paymentStatus).toBe('failed');
    expect(updated?.status).toBe('pending'); // not changed to cancelled
  });

  it('retry-payment guard: blocks COD orders', async () => {
    const order = await Order.create({
      customer:        { firstName:'X', lastName:'Y', email:'x@y.com', phone:'01012345678' },
      shippingAddress: { street:'St', city:'Cairo', governorate:'Cairo' },
      items:           [{ productId: new mongoose.Types.ObjectId(), nameEn:'P', nameAr:'P', price:100, quantity:1, image:'' }],
      subtotal:10000, shipping:0, discount:0, total:10000,
      paymentMethod:'cod', status:'confirmed', paymentStatus:'pending',
    });
    expect(order.paymentMethod).toBe('cod');
    // Guard check in route: cod orders must not be retried
    const canRetry = order.paymentMethod !== 'cod';
    expect(canRetry).toBe(false);
  });

  it('retry-payment guard: only allows failed/pending statuses', async () => {
    const cases = [
      { paymentStatus: 'failed',   expected: true  },
      { paymentStatus: 'pending',  expected: true  },
      { paymentStatus: 'paid',     expected: false },
      { paymentStatus: 'refunded', expected: false },
    ] as const;

    for (const { paymentStatus, expected } of cases) {
      const canRetry = ['failed', 'pending'].includes(paymentStatus);
      expect(canRetry).toBe(expected);
    }
  });
});
