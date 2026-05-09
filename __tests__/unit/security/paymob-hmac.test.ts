// __tests__/unit/security/paymob-hmac.test.ts — HMAC verification (security critical)
import crypto from 'crypto';

const SECRET = 'test-hmac-secret-32-chars-minimum!!';

// Mirror the exact implementation from src/lib/paymob.ts
function buildHmac(data: Record<string, string>, secret: string): string {
  const KEYS = [
    'amount_cents','created_at','currency','error_occured','has_parent_transaction',
    'id','integration_id','is_3d_secure','is_auth','is_capture','is_refunded',
    'is_standalone_payment','is_voided','order','owner','pending',
    'source_data.pan','source_data.sub_type','source_data.type','success',
  ];
  const concat = KEYS.map(k => data[k] ?? '').join('');
  return crypto.createHmac('sha512', secret).update(concat).digest('hex');
}

describe('Paymob HMAC verification', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.PAYMOB_HMAC_SECRET = SECRET;
  });

  afterAll(() => { delete process.env.PAYMOB_HMAC_SECRET; });

  it('accepts a valid HMAC signature', async () => {
    const { verifyPaymobWebhook } = await import('@/lib/paymob');
    const data: Record<string, string> = {
      amount_cents: '10000', currency: 'EGP', success: 'true', id: '12345', order: '67890',
    };
    expect(verifyPaymobWebhook(data, buildHmac(data, SECRET))).toBe(true);
  });

  it('rejects when amount_cents is tampered', async () => {
    const { verifyPaymobWebhook } = await import('@/lib/paymob');
    const data: Record<string, string> = { amount_cents: '10000', success: 'true' };
    const hmac = buildHmac(data, SECRET);
    data.amount_cents = '1'; // tampered
    expect(verifyPaymobWebhook(data, hmac)).toBe(false);
  });

  it('rejects when success flag is changed true→false', async () => {
    const { verifyPaymobWebhook } = await import('@/lib/paymob');
    const data: Record<string, string> = { amount_cents: '5000', success: 'true' };
    const hmac = buildHmac(data, SECRET);
    data.success = 'false';
    expect(verifyPaymobWebhook(data, hmac)).toBe(false);
  });

  it('rejects wrong secret', async () => {
    const { verifyPaymobWebhook } = await import('@/lib/paymob');
    const data: Record<string, string> = { amount_cents: '5000', success: 'true' };
    const hmac = buildHmac(data, 'different-secret');
    expect(verifyPaymobWebhook(data, hmac)).toBe(false);
  });

  it('rejects empty HMAC string', async () => {
    const { verifyPaymobWebhook } = await import('@/lib/paymob');
    const data: Record<string, string> = { amount_cents: '5000' };
    expect(verifyPaymobWebhook(data, '')).toBe(false);
  });

  it('rejects when PAYMOB_HMAC_SECRET is unset', async () => {
    delete process.env.PAYMOB_HMAC_SECRET;
    jest.resetModules();
    const { verifyPaymobWebhook } = await import('@/lib/paymob');
    expect(verifyPaymobWebhook({}, 'anything')).toBe(false);
  });

  it('uses timing-safe comparison (does not throw on length mismatch)', async () => {
    const { verifyPaymobWebhook } = await import('@/lib/paymob');
    // Different-length HMAC should not throw — must return false
    expect(() => verifyPaymobWebhook({}, 'short')).not.toThrow();
    expect(verifyPaymobWebhook({}, 'short')).toBe(false);
  });

  it('handles missing data fields gracefully (uses empty string)', async () => {
    const { verifyPaymobWebhook } = await import('@/lib/paymob');
    // Build HMAC with empty data — both sides should agree
    const emptyData: Record<string, string> = {};
    const hmac = buildHmac(emptyData, SECRET);
    expect(verifyPaymobWebhook(emptyData, hmac)).toBe(true);
  });
});
