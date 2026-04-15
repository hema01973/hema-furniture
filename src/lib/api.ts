// src/lib/api.ts — v2: fail-closed rate limiting option for critical endpoints
import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema } from 'zod';
import { getAuthSession } from './auth';
import { rateLimit as rl } from './redis';
import type { ApiResponse, UserRole } from '@/types';

export function ok<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}
export function err(message: string, status = 400): NextResponse<ApiResponse> {
  return NextResponse.json({ success: false, error: message }, { status });
}

export const UNAUTHORIZED = 'UNAUTHORIZED';
export const FORBIDDEN    = 'FORBIDDEN';
export const NOT_FOUND    = 'NOT_FOUND';

export function getIP(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || req.headers.get('x-real-ip') || '127.0.0.1';
}

export async function validateBody<T>(
  req: NextRequest, schema: ZodSchema<T>,
): Promise<{ data: T } | { error: NextResponse }> {
  try {
    const body = await req.json();
    const r    = schema.safeParse(body);
    if (!r.success) return { error: err(r.error.errors.map(e => e.message).join(', '), 422) };
    return { data: r.data };
  } catch { return { error: err('Invalid JSON body', 400) }; }
}

export async function withAuth(
  req: NextRequest,
  handler: (req: NextRequest, session: Awaited<ReturnType<typeof getAuthSession>>) => Promise<NextResponse>,
  allowedRoles?: UserRole[],
): Promise<NextResponse> {
  const session = await getAuthSession();
  if (!session) return err('Unauthorized', 401);
  if (allowedRoles && !allowedRoles.includes(session.user.role as UserRole)) return err('Forbidden', 403);
  return handler(req, session);
}

export function getPagination(req: NextRequest) {
  const url   = new URL(req.url);
  const page  = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '12')));
  return { page, limit, skip: (page - 1) * limit };
}

export function withErrorHandler(
  handler: (req: NextRequest, ctx?: unknown) => Promise<NextResponse>,
  opts: { failClosed?: boolean; rateMax?: number; rateWindow?: number } = {},
) {
  return async (req: NextRequest, ctx?: unknown): Promise<NextResponse> => {
    try {
      const blocked = await rl(getIP(req), opts.rateMax, opts.rateWindow, opts.failClosed ?? false);
      if (blocked) return err('Too many requests. Please try again later.', 429);
      return await handler(req, ctx);
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== 'production') console.error('[API Error]', error);
      if (error instanceof Error) {
        if (error.message === UNAUTHORIZED) return err('Unauthorized', 401);
        if (error.message === FORBIDDEN)    return err('Forbidden',    403);
        if (error.message === NOT_FOUND)    return err('Not found',    404);
        if (process.env.NODE_ENV !== 'production') return err(error.message, 500);
      }
      return err('Internal server error', 500);
    }
  };
}
