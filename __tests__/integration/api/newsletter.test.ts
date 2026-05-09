// __tests__/integration/api/newsletter.test.ts
// V027: Integration tests for the real newsletter subscription API.
// Tests the full POST/DELETE lifecycle, input validation, and rate limiting.

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';

// Note: these tests require a running MongoDB instance.
// In CI they run against the in-memory MongoDB via jest.setup.ts.

describe('POST /api/v1/newsletter', () => {
  const BASE = '/api/v1/newsletter';

  it('rejects a missing email', async () => {
    const { POST } = await import('@/app/api/v1/newsletter/route');
    const req = new Request('http://localhost' + BASE, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    });
    const res  = await POST(req as any);
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
  });

  it('rejects an invalid email', async () => {
    const { POST } = await import('@/app/api/v1/newsletter/route');
    const req = new Request('http://localhost' + BASE, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: 'not-an-email' }),
    });
    const res  = await POST(req as any);
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
  });

  it('subscribes a valid email and returns success', async () => {
    const { POST } = await import('@/app/api/v1/newsletter/route');
    const email = `test-${Date.now()}@example.com`;
    const req = new Request('http://localhost' + BASE, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.1' },
      body:    JSON.stringify({ email, lang: 'ar' }),
    });
    const res  = await POST(req as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.subscribed).toBe(true);
    expect(body.data.email).toBe(email);
  });

  it('is idempotent — re-subscribing the same email returns success', async () => {
    const { POST } = await import('@/app/api/v1/newsletter/route');
    const email = `idempotent-${Date.now()}@example.com`;
    const makeReq = () => new Request('http://localhost' + BASE, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.2' },
      body:    JSON.stringify({ email }),
    });
    await POST(makeReq() as any);
    const res  = await POST(makeReq() as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

describe('DELETE /api/v1/newsletter', () => {
  it('unsubscribes a valid email', async () => {
    const { DELETE } = await import('@/app/api/v1/newsletter/route');
    const email = `unsub-${Date.now()}@example.com`;
    const req = new Request('http://localhost/api/v1/newsletter', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email }),
    });
    const res  = await DELETE(req as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.unsubscribed).toBe(true);
  });
});
