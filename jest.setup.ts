// jest.setup.ts — HemaV052
import mongoose from 'mongoose';

// Increase timeout for DB operations
jest.setTimeout(30_000);

// ── TEST-003 FIX (HemaV052): Network guard ────────────────────────────────
// Block real outbound fetch calls in the test environment. Any test that
// calls a real external URL without mocking it will fail immediately with
// a clear message, rather than hanging, timing out, or producing
// nondeterministic CI results. Tests that need fetch must mock it explicitly
// (see __tests__/mocks/paymob-handlers.ts for the Paymob mock pattern).
//
// Allowlist: localhost (MongoMemoryServer), 127.0.0.1 (Redis in CI)
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const _realFetch = globalThis.fetch;
globalThis.fetch = function guardedFetch(input: RequestInfo | URL, init?: RequestInit) {
  let url: string;
  if (typeof input === 'string')        url = input;
  else if (input instanceof URL)        url = input.toString();
  else                                  url = input.url;

  try {
    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      throw new Error(
        `[TEST-003 NetworkGuard] Real outbound fetch blocked in test environment.\n` +
        `URL: ${url}\n` +
        `Mock this call using jest.spyOn(global, 'fetch') or the paymob-handlers mock.\n` +
        `If this is intentional, add the hostname to ALLOWED_HOSTS in jest.setup.ts.`
      );
    }
  } catch (e) {
    // URL parse failure or blocked — rethrow blocked errors, ignore parse errors for relative URLs
    if (e instanceof Error && e.message.includes('NetworkGuard')) throw e;
  }

  return _realFetch(input, init);
} as typeof globalThis.fetch;

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

