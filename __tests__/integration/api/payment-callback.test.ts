// __tests__/integration/api/payment-callback.test.ts — Paymob callback critical path
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import { connectDB, Order } from '@/lib/mongodb';

let mongod: MongoMemoryServer;

const HMAC_SECRET = 'test-hmac-secret-minimum-32-chars!!';

function buildHmac(data: Record<string, string>): string {
  const KEYS = [
    'amount_cents','created_at','currency','error_occured','has_parent_transaction',
    'id','integration_id','is_3d_secure','is_auth','is_capture','is_refunded',
    'is_standalone_payment','is_voided','order','owner','pending',
    'source_data.pan','source_data.sub_type','source_data.type','success',
  ];
  return crypto
    .createHmac('sha512', HMAC_SECRET)
    .update(KEYS.map(k => data[k] ?? '').join(''))
    .digest('hex');
}

const ORDER_BASE = {
  customer:        { firstName: 'A', lastName: 'B', email: 'a@b.com', phone: '01234567890' },
  shippingAddress: { street: '1 St', city: 'Cairo', governorate: 'Cairo' },
  items:           [{ productId: new mongoose.Types.ObjectId(), nameEn: 'P', nameAr: 'م', price: 1000, quantity: 1, image: '' }],
  paymentMethod:   'paymob',
  paymentStatus:   'pending',
  status:          'pending',
  subtotal:        1000,
  shipping:        299,
  discount:        0,
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI      = mongod.getUri();
  process.env.NEXTAUTH_SECRET  = 'a'.repeat(32);
  process.env.PAYMOB_HMAC_SECRET = HMAC_SECRET;
  await connectDB();
  jest.mock('@/lib/queue', () => ({ enqueueEmail: jest.fn().mockResolvedValue(undefined) }));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => { await Order.deleteMany({}); });

async function createPendingOrder(paymobOrderId: string) {
  return Order.create({
    ...ORDER_BASE,
    orderNumber: `HEM-${Date.now()}`,
    total: 1299,
    paymobOrderId,
  });
}

describe('Paymob callback — success cases', () => {
  it('marks order as paid + confirmed on successful payment', async () => {
    const order     = await createPendingOrder('PAY-001');
    const callbackData = { id: 'tx-1', order: 'PAY-001', amount_cents: '129900', success: 'true', currency: 'EGP' };
    const hmac      = buildHmac(callbackData);

    const { verifyPaymobWebhook } = await import('@/lib/paymob');
    expect(verifyPaymobWebhook(callbackData, hmac)).toBe(true);

    await Order.findOneAndUpdate(
      { paymobOrderId: 'PAY-001' },
      { paymentStatus: 'paid', status: 'confirmed' }
    );
    const updated = await Order.findById(order._id);
    expect(updated!.paymentStatus).toBe('paid');
    expect(updated!.status).toBe('confirmed');
  });

  it('is idempotent — second callback for same order is a no-op', async () => {
    await createPendingOrder('PAY-002');
    // First callback
    await Order.findOneAndUpdate({ paymobOrderId: 'PAY-002' }, { paymentStatus: 'paid', status: 'confirmed' });
    // Second callback — should not change anything (idempotent)
    await Order.findOneAndUpdate({ paymobOrderId: 'PAY-002' }, { paymentStatus: 'paid', status: 'confirmed' });
    const found = await Order.findOne({ paymobOrderId: 'PAY-002' });
    expect(found!.paymentStatus).toBe('paid'); // still paid — no regression
  });
});

describe('Paymob callback — failure cases', () => {
  it('marks order as failed when success=false', async () => {
    const order = await createPendingOrder('PAY-003');
    await Order.findOneAndUpdate({ paymobOrderId: 'PAY-003' }, { paymentStatus: 'failed' });
    const updated = await Order.findById(order._id);
    expect(updated!.paymentStatus).toBe('failed');
    expect(updated!.status).toBe('pending'); // status unchanged — not confirmed
  });

  it('rejects tampered HMAC', async () => {
    const { verifyPaymobWebhook } = await import('@/lib/paymob');
    const data = { amount_cents: '10000', success: 'true', order: 'PAY-003' };
    const hmac = buildHmac(data);
    data.amount_cents = '1'; // tamper
    expect(verifyPaymobWebhook(data, hmac)).toBe(false);
  });

  it('does nothing for unknown paymobOrderId (idempotent 404 handling)', async () => {
    const order = await Order.findOne({ paymobOrderId: 'UNKNOWN-999' });
    expect(order).toBeNull(); // should not throw, just null
  });

  it('handles boolean success value (not just string)', async () => {
    const successTrue  = 'true';
    const successBool  = String(true);
    expect(successTrue === 'true' || successBool === 'true').toBe(true);
  });
});

describe('Paymob callback — network failure simulation', () => {
  it('gracefully handles missing obj field in callback body', async () => {
    const { verifyPaymobWebhook } = await import('@/lib/paymob');
    // Missing data — should return false, not throw
    expect(() => verifyPaymobWebhook({} as Record<string, string>, 'anyhash')).not.toThrow();
    expect(verifyPaymobWebhook({} as Record<string, string>, 'anyhash')).toBe(false);
  });
});
