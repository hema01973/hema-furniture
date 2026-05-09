/**
 * TEST-003: Paymob Mock Handlers (MSW / nock alternative using jest.fn + fetch spy)
 * HemaV052
 *
 * Provides a fully mocked implementation of the Paymob API surface so that:
 *   1. No real HTTP calls leave the test process
 *   2. Tests are deterministic and fast (no network latency)
 *   3. Error paths (timeout, auth failure, payment decline) can be exercised
 *
 * Usage in test files:
 *   import { setupPaymobMocks, paymobMocks, resetPaymobMocks } from '@/__tests__/mocks/paymob-handlers';
 *
 *   beforeAll(() => setupPaymobMocks());
 *   afterEach(() => resetPaymobMocks());
 */

const PAYMOB_BASE = 'https://accept.paymob.com/api';

// ── Configurable mock state ───────────────────────────────────────────────
export interface PaymobMockConfig {
  authToken:        string;
  orderId:          number;
  paymentKey:       string;
  transactionId:    number;
  shouldAuthFail:   boolean;
  shouldOrderFail:  boolean;
  shouldPayKeyFail: boolean;
  shouldRefundFail: boolean;
  networkTimeout:   boolean;
}

const _defaultConfig: PaymobMockConfig = {
  authToken:        'mock-auth-token-abc123',
  orderId:          999001,
  paymentKey:       'mock-payment-key-xyz789',
  transactionId:    777001,
  shouldAuthFail:   false,
  shouldOrderFail:  false,
  shouldPayKeyFail: false,
  shouldRefundFail: false,
  networkTimeout:   false,
};

let _config: PaymobMockConfig = { ..._defaultConfig };

/** Override specific mock behaviours for a test */
export function configurePaymobMock(overrides: Partial<PaymobMockConfig>): void {
  _config = { ..._config, ...overrides };
}

/** Reset mock state to defaults */
export function resetPaymobMocks(): void {
  _config = { ..._defaultConfig };
  _callLog.length = 0;
}

/** Log of calls made to the mock for assertions */
export const _callLog: Array<{ url: string; method: string; body: unknown }> = [];

// ── Mock fetch implementation ─────────────────────────────────────────────
function buildMockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }) as Response;
}

async function mockPaymobFetch(url: string, options: RequestInit): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase();
  let body: unknown = undefined;
  try { body = options.body ? JSON.parse(options.body as string) : undefined; } catch { /* ok */ }

  _callLog.push({ url, method, body });

  // Simulate network timeout
  if (_config.networkTimeout) {
    await new Promise<never>((_, reject) =>
      setTimeout(() => reject(new TypeError('network timeout')), 10),
    );
  }

  // ── Auth token endpoint ──────────────────────────────────────────
  if (url === `${PAYMOB_BASE}/auth/tokens`) {
    if (_config.shouldAuthFail) {
      return buildMockResponse({ message: 'Invalid API Key' }, 401);
    }
    return buildMockResponse({ token: _config.authToken });
  }

  // ── Create order endpoint ────────────────────────────────────────
  if (url === `${PAYMOB_BASE}/ecommerce/orders`) {
    if (_config.shouldOrderFail) {
      return buildMockResponse({ message: 'Order creation failed' }, 500);
    }
    return buildMockResponse({ id: _config.orderId });
  }

  // ── Payment key endpoint ─────────────────────────────────────────
  if (url === `${PAYMOB_BASE}/acceptance/payment_keys`) {
    if (_config.shouldPayKeyFail) {
      return buildMockResponse({ message: 'Payment key error' }, 400);
    }
    return buildMockResponse({ token: _config.paymentKey });
  }

  // ── Refund endpoint ──────────────────────────────────────────────
  if (url.includes('void_refund/refund')) {
    if (_config.shouldRefundFail) {
      return buildMockResponse({ message: 'Refund failed' }, 422);
    }
    return buildMockResponse({ id: _config.transactionId, pending: false, success: true });
  }

  // Unknown URL — fail loudly so we notice unmocked calls
  throw new Error(
    `[PaymobMock] Unmocked fetch call: ${method} ${url}\n` +
    `Add a handler to paymob-handlers.ts or the test is making unexpected network calls.`
  );
}

// ── Setup / teardown ──────────────────────────────────────────────────────
let _originalFetch: typeof globalThis.fetch;

export function setupPaymobMocks(): void {
  _originalFetch = globalThis.fetch;
  globalThis.fetch = mockPaymobFetch as unknown as typeof globalThis.fetch;
}

export function teardownPaymobMocks(): void {
  globalThis.fetch = _originalFetch;
  resetPaymobMocks();
}

/** Convenience: assert a specific URL was called */
export function assertPaymobCalled(urlFragment: string): void {
  const found = _callLog.some(c => c.url.includes(urlFragment));
  if (!found) {
    const urls = _callLog.map(c => c.url).join(', ');
    throw new Error(`Expected Paymob call to "${urlFragment}" but got: [${urls}]`);
  }
}

/** Convenience: assert total call count */
export function assertPaymobCallCount(n: number): void {
  if (_callLog.length !== n) {
    throw new Error(`Expected ${n} Paymob calls but got ${_callLog.length}`);
  }
}
