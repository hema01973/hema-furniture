// __tests__/unit/api.test.ts
// Unit tests for API utility helpers.

import { NextRequest } from 'next/server';
import { ok, err, getIP, getPagination, validateBody, UNAUTHORIZED, FORBIDDEN, NOT_FOUND } from '../../src/lib/api';
import { z } from 'zod';

// ── Mock redis so tests don't need a real server ──────────────────
jest.mock('../../src/lib/redis', () => ({
  rateLimit:  jest.fn().mockResolvedValue(false),
  getRedis:   jest.fn().mockResolvedValue(null),
  cacheGet:   jest.fn().mockResolvedValue(null),
  cacheSet:   jest.fn().mockResolvedValue(undefined),
  cacheDel:   jest.fn().mockResolvedValue(undefined),
}));

// ── Mock auth ─────────────────────────────────────────────────────
jest.mock('../../src/lib/auth', () => ({
  getAuthSession: jest.fn(),
}));

// ─────────────────────────────────────────────────────────────────
describe('ok()', () => {
  it('returns 200 with success:true and data', () => {
    const res  = ok({ id: 1 });
    expect(res.status).toBe(200);
  });

  it('respects a custom status code', () => {
    const res = ok({}, 201);
    expect(res.status).toBe(201);
  });
});

describe('err()', () => {
  it('returns 400 with success:false and the message', () => {
    const res = err('Something broke');
    expect(res.status).toBe(400);
  });

  it('respects a custom status code', () => {
    const res = err('Not found', 404);
    expect(res.status).toBe(404);
  });
});

describe('Named error sentinels', () => {
  it('exports UNAUTHORIZED', () => expect(UNAUTHORIZED).toBe('UNAUTHORIZED'));
  it('exports FORBIDDEN',    () => expect(FORBIDDEN).toBe('FORBIDDEN'));
  it('exports NOT_FOUND',    () => expect(NOT_FOUND).toBe('NOT_FOUND'));
});

describe('getIP()', () => {
  const makeReq = (headers: Record<string, string>) =>
    new NextRequest('http://localhost/api/test', { headers });

  it('returns x-forwarded-for (first IP only)', () => {
    const req = makeReq({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(getIP(req)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    const req = makeReq({ 'x-real-ip': '9.9.9.9' });
    expect(getIP(req)).toBe('9.9.9.9');
  });

  it('defaults to 127.0.0.1', () => {
    const req = makeReq({});
    expect(getIP(req)).toBe('127.0.0.1');
  });
});

describe('getPagination()', () => {
  const makeReq = (qs: string) =>
    new NextRequest(`http://localhost/api/test?${qs}`);

  it('returns defaults when no params provided', () => {
    const { page, limit, skip } = getPagination(makeReq(''));
    expect(page).toBe(1);
    expect(limit).toBe(12);
    expect(skip).toBe(0);
  });

  it('calculates skip correctly', () => {
    const { skip } = getPagination(makeReq('page=3&limit=10'));
    expect(skip).toBe(20);
  });

  it('clamps limit to max 50', () => {
    const { limit } = getPagination(makeReq('limit=999'));
    expect(limit).toBe(50);
  });

  it('clamps page to min 1', () => {
    const { page } = getPagination(makeReq('page=-5'));
    expect(page).toBe(1);
  });
});

describe('validateBody()', () => {
  const schema = z.object({ name: z.string().min(2), age: z.number().int().positive() });

  const makeReq = (body: unknown) =>
    new NextRequest('http://localhost/api/test', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

  it('returns data for valid input', async () => {
    const result = await validateBody(makeReq({ name: 'Ali', age: 30 }), schema);
    expect('data' in result).toBe(true);
    if ('data' in result) expect(result.data.name).toBe('Ali');
  });

  it('returns error for invalid input', async () => {
    const result = await validateBody(makeReq({ name: 'A', age: -1 }), schema);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(422);
  });

  it('returns error for non-JSON body', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      body:   'this is not json',
      headers: { 'Content-Type': 'text/plain' },
    });
    const result = await validateBody(req, schema);
    expect('error' in result).toBe(true);
  });
});
