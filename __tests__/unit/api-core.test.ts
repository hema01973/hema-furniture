// __tests__/unit/api-core.test.ts — typed errors + DI container
import { AppError, NotFoundError, UnauthorizedError, ForbiddenError,
         ValidationError, ConflictError, setContainer, resetContainer,
         withErrorHandler, ok, err } from '@/lib/api';
import { NextRequest } from 'next/server';

process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
process.env.NODE_ENV        = 'test';

function makeReq(method = 'GET', path = '/api/test'): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { method });
}

describe('AppError hierarchy', () => {
  it('NotFoundError has status 404', () => {
    const e = new NotFoundError();
    expect(e.statusCode).toBe(404);
    expect(e.code).toBe('NOT_FOUND');
  });
  it('UnauthorizedError has status 401', () => {
    expect(new UnauthorizedError().statusCode).toBe(401);
  });
  it('ForbiddenError has status 403', () => {
    expect(new ForbiddenError().statusCode).toBe(403);
  });
  it('ValidationError has status 422', () => {
    expect(new ValidationError('bad field').statusCode).toBe(422);
  });
  it('ConflictError has status 409', () => {
    expect(new ConflictError().statusCode).toBe(409);
  });
  it('AppError custom message', () => {
    const e = new AppError('Custom', 418, 'IM_A_TEAPOT');
    expect(e.message).toBe('Custom');
    expect(e.statusCode).toBe(418);
    expect(e.code).toBe('IM_A_TEAPOT');
  });
});

describe('ok / err responses', () => {
  it('ok returns success:true with data', async () => {
    const res  = ok({ id: 1 });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(res.status).toBe(200);
  });

  it('ok accepts custom status', async () => {
    expect(ok({}, 201).status).toBe(201);
  });

  it('err returns success:false', async () => {
    const res  = err('Bad request');
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Bad request');
    expect(res.status).toBe(400);
  });

  it('err accepts code', async () => {
    const body = await err('Not found', 404, 'NOT_FOUND').json();
    expect(body.code).toBe('NOT_FOUND');
  });
});

describe('withErrorHandler + DI container', () => {
  afterEach(() => resetContainer());

  it('returns handler result normally', async () => {
    const handler = withErrorHandler(async () => ok({ ok: true }), { skipRateLimit: true });
    const res     = await handler(makeReq());
    expect(res.status).toBe(200);
  });

  it('catches AppError and maps to correct status', async () => {
    const handler = withErrorHandler(
      async () => { throw new NotFoundError('product not found'); },
      { skipRateLimit: true }
    );
    const res  = await handler(makeReq());
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('uses injected rate limiter (DI)', async () => {
    const mockLimiter = jest.fn().mockResolvedValue({ blocked: true, remaining: 0, retryAfterSec: 60 }); // always block
    setContainer({ rateLimiter: mockLimiter });

    const handler = withErrorHandler(async () => ok({ ok: true }));
    const res     = await handler(makeReq());
    expect(res.status).toBe(429);
    expect(mockLimiter).toHaveBeenCalledTimes(1);
  });

  it('injects X-Correlation-Id in every response', async () => {
    const handler = withErrorHandler(async () => ok({}), { skipRateLimit: true });
    const res     = await handler(makeReq());
    expect(res.headers.get('X-Correlation-Id')).toBeTruthy();
  });

  it('catches legacy UNAUTHORIZED string throw', async () => {
    const handler = withErrorHandler(
      async () => { throw new Error('UNAUTHORIZED'); },
      { skipRateLimit: true }
    );
    const res = await handler(makeReq());
    expect(res.status).toBe(401);
  });
});
