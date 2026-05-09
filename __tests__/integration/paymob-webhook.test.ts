// __tests__/integration/paymob-webhook.test.ts
import crypto from 'crypto';

const MOCK_SECRET = 'test-hmac-secret-32chars-minimum!!';

function buildHmac(data: Record<string, string>): string {
  const keys = [
    'amount_cents','created_at','currency','error_occured','has_parent_transaction',
    'id','integration_id','is_3d_secure','is_auth','is_capture','is_refunded',
    'is_standalone_payment','is_voided','order','owner','pending',
    'source_data.pan','source_data.sub_type','source_data.type','success',
  ];
  const concat = keys.map(k => data[k] ?? '').join('');
  return crypto.createHmac('sha512', MOCK_SECRET).update(concat).digest('hex');
}

describe('verifyPaymobWebhook', () => {
  const originalSecret = process.env.PAYMOB_HMAC_SECRET;

  beforeEach(() => {
    jest.resetModules();
    process.env.PAYMOB_HMAC_SECRET = MOCK_SECRET;
  });

  afterAll(() => {
    process.env.PAYMOB_HMAC_SECRET = originalSecret;
  });

  it('accepts a valid HMAC', async () => {
    const { verifyPaymobWebhook } = await import('@/lib/paymob');
    const data: Record<string, string> = {
      amount_cents: '10000', currency: 'EGP', success: 'true',
      id: '12345', order: '67890',
    };
    const hmac = buildHmac(data);
    expect(verifyPaymobWebhook(data, hmac)).toBe(true);
  });

  it('rejects a tampered payload', async () => {
    const { verifyPaymobWebhook } = await import('@/lib/paymob');
    const data: Record<string, string> = {
      amount_cents: '10000', currency: 'EGP', success: 'true',
    };
    const hmac = buildHmac(data);
    data.amount_cents = '99999'; // tampered
    expect(verifyPaymobWebhook(data, hmac)).toBe(false);
  });

  it('rejects when PAYMOB_HMAC_SECRET is missing', async () => {
    delete process.env.PAYMOB_HMAC_SECRET;
    jest.resetModules();
    const { verifyPaymobWebhook } = await import('@/lib/paymob');
    expect(verifyPaymobWebhook({}, 'anything')).toBe(false);
  });
});
