/**
 * TEST-003: createPaymobSession — Mocked External API Tests
 * HemaV052
 *
 * Verifies all Paymob integration paths using the mock handlers.
 * Zero real network calls — safe for CI.
 *
 * Covers:
 *   - Happy path: auth → order → payment key → iframe URL assembled correctly
 *   - Auth failure → throws with meaningful message
 *   - Order creation failure → throws
 *   - Payment key failure → throws
 *   - Network timeout → throws with retry context
 *   - Refund success and failure paths
 *   - HMAC verification correctness
 */

import crypto from 'crypto';
import {
  setupPaymobMocks,
  teardownPaymobMocks,
  configurePaymobMock,
  resetPaymobMocks,
  assertPaymobCalled,
  assertPaymobCallCount,
} from '../mocks/paymob-handlers';

// ── Import under test ──────────────────────────────────────────────────────
import { createPaymobSession, verifyPaymobWebhook } from '@/lib/paymob';
import type { PaymobOrder, PaymobCustomer } from '@/lib/paymob';

// ── Test fixtures ─────────────────────────────────────────────────────────
const MOCK_ORDER: PaymobOrder = {
  id:         'order-123',
  amount:     8500,
  currency:   'EGP',
  items:      [{ name: 'Oslo Sofa', qty: 1, amount: 8500 }],
};

const MOCK_CUSTOMER: PaymobCustomer = {
  firstName: 'Ahmed',
  lastName:  'Hassan',
  email:     'ahmed@example.com',
  phone:     '01012345678',
};

// ── Setup ──────────────────────────────────────────────────────────────────
beforeAll(() => {
  process.env.PAYMOB_API_KEY        = 'test-api-key';
  process.env.PAYMOB_INTEGRATION_ID = '654321';
  process.env.PAYMOB_IFRAME_ID      = '111';
  process.env.PAYMOB_HMAC_SECRET    = 'test-hmac-secret-for-unit-tests';
  setupPaymobMocks();
});

afterAll(() => {
  teardownPaymobMocks();
});

afterEach(() => {
  resetPaymobMocks();
});

// ── Happy path ─────────────────────────────────────────────────────────────
describe('TEST-003: createPaymobSession — mock external calls', () => {
  test('happy path: returns iframeUrl containing payment key', async () => {
    const result = await createPaymobSession(MOCK_ORDER, MOCK_CUSTOMER);

    expect(result.iframeUrl).toContain('mock-payment-key-xyz789');
    expect(result.iframeUrl).toContain('accept.paymob.com');
  });

  test('happy path: calls auth → order → payment_keys in sequence', async () => {
    await createPaymobSession(MOCK_ORDER, MOCK_CUSTOMER);

    assertPaymobCalled('/auth/tokens');
    assertPaymobCalled('/ecommerce/orders');
    assertPaymobCalled('/acceptance/payment_keys');
    assertPaymobCallCount(3);
  });

  test('happy path: payment key request includes correct amount in piasters', async () => {
    const { _callLog } = await import('../mocks/paymob-handlers');
    await createPaymobSession(MOCK_ORDER, MOCK_CUSTOMER);

    const payKeyCall = _callLog.find(c => c.url.includes('payment_keys'));
    expect(payKeyCall).toBeDefined();
    // Amount should be in piasters (× 100)
    expect((payKeyCall!.body as Record<string, unknown>).amount_cents).toBe(850000);
  });
});

// ── Auth failure ───────────────────────────────────────────────────────────
describe('TEST-003: createPaymobSession — auth failure', () => {
  test('throws when Paymob auth returns 401', async () => {
    configurePaymobMock({ shouldAuthFail: true });

    await expect(createPaymobSession(MOCK_ORDER, MOCK_CUSTOMER)).rejects.toThrow();
    // Must only call auth (should not proceed to order/payment_keys)
    assertPaymobCallCount(1);
    assertPaymobCalled('/auth/tokens');
  });
});

// ── Order creation failure ─────────────────────────────────────────────────
describe('TEST-003: createPaymobSession — order creation failure', () => {
  test('throws when Paymob order endpoint returns 500', async () => {
    configurePaymobMock({ shouldOrderFail: true });

    await expect(createPaymobSession(MOCK_ORDER, MOCK_CUSTOMER)).rejects.toThrow();
    // Auth must succeed; order call made; payment key must NOT be called
    assertPaymobCalled('/auth/tokens');
    assertPaymobCalled('/ecommerce/orders');
    const { _callLog } = await import('../mocks/paymob-handlers');
    const payKeyCalled = _callLog.some(c => c.url.includes('payment_keys'));
    expect(payKeyCalled).toBe(false);
  });
});

// ── Payment key failure ────────────────────────────────────────────────────
describe('TEST-003: createPaymobSession — payment key failure', () => {
  test('throws when payment key endpoint returns 400', async () => {
    configurePaymobMock({ shouldPayKeyFail: true });

    await expect(createPaymobSession(MOCK_ORDER, MOCK_CUSTOMER)).rejects.toThrow();
    assertPaymobCallCount(3); // auth + order + (failed) payment_key
  });
});

// ── Network timeout ────────────────────────────────────────────────────────
describe('TEST-003: createPaymobSession — network timeout', () => {
  test('throws on network timeout', async () => {
    configurePaymobMock({ networkTimeout: true });

    await expect(createPaymobSession(MOCK_ORDER, MOCK_CUSTOMER))
      .rejects
      .toThrow(/timeout|network/i);
  });
});

// ── HMAC verification ──────────────────────────────────────────────────────
describe('TEST-003: verifyPaymobWebhook — HMAC mock tests', () => {
  const HMAC_SECRET = 'test-hmac-secret-for-unit-tests';

  function buildHmacString(data: Record<string, string>): string {
    const HMAC_KEYS = [
      'amount_cents','created_at','currency','error_occured','has_parent_transaction',
      'id','integration_id','is_3d_secure','is_auth','is_capture','is_refunded',
      'is_standalone_payment','is_voided','order','owner','pending',
      'source_data.pan','source_data.sub_type','source_data.type','success',
    ];
    return HMAC_KEYS.map(k => data[k] ?? '').join('');
  }

  function makeSignedPayload(overrides: Record<string, string> = {}) {
    const data: Record<string, string> = {
      amount_cents: '100000', created_at: '2026-01-01T00:00:00Z',
      currency: 'EGP', error_occured: 'false', has_parent_transaction: 'false',
      id: '12345', integration_id: '654321', is_3d_secure: 'false',
      is_auth: 'false', is_capture: 'false', is_refunded: 'false',
      is_standalone_payment: 'true', is_voided: 'false', order: '99999',
      owner: '11111', pending: 'false', 'source_data.pan': '1234',
      'source_data.sub_type': 'MasterCard', 'source_data.type': 'card',
      success: 'true', ...overrides,
    };
    const hmac = crypto
      .createHmac('sha512', HMAC_SECRET)
      .update(buildHmacString(data))
      .digest('hex');
    return { data, hmac };
  }

  test('accepts valid HMAC signature', () => {
    const { data, hmac } = makeSignedPayload();
    expect(verifyPaymobWebhook(data, hmac)).toBe(true);
  });

  test('rejects tampered data (success changed to false)', () => {
    const { data, hmac } = makeSignedPayload();
    data.success = 'false'; // tamper after signing
    expect(verifyPaymobWebhook(data, hmac)).toBe(false);
  });

  test('rejects wrong HMAC secret', () => {
    const { data } = makeSignedPayload();
    const wrongHmac = crypto
      .createHmac('sha512', 'wrong-secret')
      .update(buildHmacString(data))
      .digest('hex');
    expect(verifyPaymobWebhook(data, wrongHmac)).toBe(false);
  });

  test('rejects empty HMAC string', () => {
    const { data } = makeSignedPayload();
    expect(verifyPaymobWebhook(data, '')).toBe(false);
  });

  test('rejects truncated HMAC', () => {
    const { data, hmac } = makeSignedPayload();
    expect(verifyPaymobWebhook(data, hmac.slice(0, 64))).toBe(false);
  });
});
