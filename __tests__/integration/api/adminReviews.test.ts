// __tests__/integration/api/adminReviews.test.ts — V031
// Integration tests for admin review moderation endpoints.

import { describe, it, expect } from '@jest/globals';

describe('GET /api/v1/admin/reviews', () => {
  it('returns 401 for unauthenticated request', async () => {
    const { GET } = await import('@/app/api/v1/admin/reviews/route');
    const req = new Request('http://localhost/api/v1/admin/reviews', { method: 'GET' });
    const res  = await GET(req as any);
    expect([401, 403]).toContain(res.status);
  });
});

describe('PATCH /api/v1/admin/reviews/[id]', () => {
  it('returns 401 for unauthenticated request', async () => {
    const { PATCH } = await import('@/app/api/v1/admin/reviews/[id]/route');
    const req = new Request('http://localhost/api/v1/admin/reviews/fake-id', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isApproved: true }),
    });
    const res = await PATCH(req as any, { params: { id: 'fake-id' } } as any);
    expect([401, 403]).toContain(res.status);
  });
});
