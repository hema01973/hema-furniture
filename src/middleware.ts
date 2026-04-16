// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

const ADMIN_PATHS     = ['/admin'];
const PROTECTED_PATHS = ['/checkout', '/orders', '/account'];
const AUTH_PATHS      = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];
const ADMIN_API       = ['/api/analytics', '/api/upload'];
const AUTH_API        = ['/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/mfa'];

function buildCSP(nonce: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' https://accept.paymob.com`
    : `'self' 'nonce-${nonce}' 'unsafe-eval' https://accept.paymob.com`;

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com",
    `connect-src 'self' https://accept.paymob.com${!isProd ? ' ws://localhost:*' : ''}`,
    "frame-src https://accept.paymob.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    isProd ? "upgrade-insecure-requests" : '',
  ].filter(Boolean).join('; ');
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/images') ||
    pathname.includes('/favicon.ico') ||
    /\.(css|js|ico|png|jpg|jpeg|svg|webp|woff|woff2|ttf|eot)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Generate nonce for CSP (Edge Runtime compatible)
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const res = NextResponse.next();

  // Security headers
  res.headers.set('Content-Security-Policy', buildCSP(nonce));
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-XSS-Protection', '1; mode=block');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.headers.delete('X-Powered-By');
  
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  
  res.headers.set('x-nonce', nonce);

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // Admin routes
  if (ADMIN_PATHS.some(p => pathname.startsWith(p))) {
    if (!token) return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(pathname)}`, req.url));
    if (token.role !== 'admin' && token.role !== 'staff') return NextResponse.redirect(new URL('/?error=unauthorized', req.url));
    return res;
  }

  // Protected routes
  if (PROTECTED_PATHS.some(p => pathname.startsWith(p))) {
    if (!token) return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(pathname)}`, req.url));
    return res;
  }

  // Auth pages
  if (AUTH_PATHS.includes(pathname)) {
    if (token) return NextResponse.redirect(new URL(token.role === 'admin' ? '/admin' : '/', req.url));
    return res;
  }

  // Admin API
  if (ADMIN_API.some(p => pathname.startsWith(p))) {
    if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (token.role !== 'admin' && token.role !== 'staff') return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    return res;
  }

  // Auth APIs
  if (AUTH_API.some(p => pathname.startsWith(p))) {
    return res;
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)).*)',
  ],
};