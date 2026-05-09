// src/... — HemaV050: centralised fetch wrapper that attaches the CSRF token
// 
// WHY THIS EXISTS:
//   The middleware validates X-CSRF-Token on every mutating request (POST/PUT/PATCH/DELETE).
//   The token lives in the __hema_csrf cookie (JS-readable, httpOnly=false by design).
//   Previously every component read the cookie itself — or worse, forgot to send it at all,
//   causing silent 403 CSRF_INVALID failures in production.
//
// USAGE:
//   import { apiFetch } from '@/lib/fetchWithCsrf';
//   const res = await apiFetch('/api/v1/orders', { method: 'POST', body: JSON.stringify(data) });

const CSRF_COOKIE = '__hema_csrf';
const CSRF_HEADER = 'x-csrf-token';

/** Read the CSRF token from the JS-readable cookie */
function getCsrfToken(): string {
  if (typeof document === 'undefined') return ''; // SSR guard
  const match = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.split('=')[1] ?? '') : '';
}

/**
 * Drop-in replacement for `fetch()` that:
 *  - Automatically attaches the CSRF token header on mutating methods
 *  - Sets Content-Type: application/json when body is a string (JSON)
 *  - Leaves GET/HEAD/OPTIONS unchanged (no CSRF needed)
 */
export async function apiFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  const headers = new Headers(init.headers);

  if (mutating) {
    const token = getCsrfToken();
    if (token) headers.set(CSRF_HEADER, token);
  }

  // Auto-set JSON content type when body is a string
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, { ...init, headers });
}
