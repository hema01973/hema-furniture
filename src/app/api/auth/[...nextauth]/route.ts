// src/... — HemaV050: Auth.js v5
// In v5 the route is simply re-exporting the handlers built by NextAuth().
// Rate-limiting is preserved around the credentials callback path.
import { NextRequest, NextResponse } from 'next/server';
import { handlers }                  from '@/lib/auth';
import { rateLimit }                 from '@/lib/redis';
import { getIP }                     from '@/lib/api';

async function rateLimitedHandler(req: NextRequest) {
  // Only rate-limit POST to /api/auth/callback/credentials (= login attempt)
  if (req.method === 'POST' && req.nextUrl.pathname === '/api/auth/callback/credentials') {
    const ip      = getIP(req);
    const blocked = await rateLimit(`login:${ip}`, 10, 900, true);
    if (blocked) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please wait 15 minutes.' },
        { status: 429 },
      );
    }
  }
  // Auth.js v5 handlers accept only the Request object
  return (handlers.POST as (req: NextRequest) => Promise<Response>)(req);
}

export { rateLimitedHandler as POST };
export const GET = handlers.GET;
