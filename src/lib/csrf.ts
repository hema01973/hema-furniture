// src/lib/csrf.ts — HemaV054
// ARCH-01 FIX (V054): Upgraded from Double-Submit Cookie to Signed Double-Submit.
//
// ── WHY THE CHANGE ─────────────────────────────────────────────────────────────
// The previous pattern stored the SAME signed token in both cookie and header.
// Any XSS that reads the JS-readable cookie can replay it verbatim as a header,
// making the Double-Submit check pass — CSRF protection collapses under XSS.
//
// ── NEW PATTERN (Signed Double-Submit Cookie — OWASP recommended) ──────────────
// Cookie → "__hema_csrf" = the full signed token  (JS-readable, httpOnly:false)
// Header → "x-csrf-token" = must equal cookie value
//
// The token format is: "<nonce>.<expiry>.<HMAC(nonce.expiry)>"
// The HMAC is keyed with NEXTAUTH_SECRET (server-side only).
//
// Security model:
//   • Cross-site attacker: cannot SET the cookie (SameSite=Lax), cannot READ it
//     (different origin), cannot forge the HMAC without NEXTAUTH_SECRET. ✅
//   • XSS attacker: CAN read the cookie, CAN echo it in the header → passes.
//     This is an accepted limitation of all cookie-based CSRF patterns when JS
//     reads the cookie. The HMAC prevents an attacker from crafting a valid
//     token WITHOUT first having XSS access.
//   • Combined protection: CSP (nonce-based, no unsafe-inline) reduces XSS
//     surface; SameSite=Lax blocks cross-site POSTs in modern browsers.
//
// ── EDGE COMPATIBILITY ─────────────────────────────────────────────────────────
// Uses only Web Crypto API (crypto.subtle) — works in Next.js Edge Runtime.
//
// References:
//   OWASP CSRF Prevention — Signed Double-Submit Cookie
//   https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

export const CSRF_COOKIE  = '__hema_csrf';
export const CSRF_HEADER  = 'x-csrf-token';
const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// ── Crypto primitives ─────────────────────────────────────────────────────────

function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(payload: string): Promise<string> {
  // Edge-safe import: use secrets.edge.ts to avoid pulling Node.js async_hooks
  // into the Edge bundle via logger → secrets chain.
  const { getSecretSync } = await import('./secrets.edge');
  // MED-06 FIX (V067): Prefer CSRF_SECRET for independent rotation from NEXTAUTH_SECRET.
  // Rotating NEXTAUTH_SECRET previously invalidated all active CSRF tokens simultaneously.
  // With a separate CSRF_SECRET, each can be rotated independently. Falls back to
  // NEXTAUTH_SECRET for backward compatibility with existing deployments.
  const secret = getSecretSync('CSRF_SECRET' as any) ?? getSecretSync('NEXTAUTH_SECRET');
  if (!process.env.CSRF_SECRET && process.env.NODE_ENV === 'production') {
    // Using console.warn — logger uses async_hooks which is not available in Edge Runtime.
    console.warn(JSON.stringify({ level: 'warn', msg: '[CSRF] CSRF_SECRET not set — falling back to NEXTAUTH_SECRET. Set CSRF_SECRET for independent rotation.' }));
  }

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[CSRF] NEXTAUTH_SECRET (or CSRF_SECRET) is not configured');
    }
    return ''.padEnd(64, '0');
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison — prevents timing oracle attacks */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let equal = true;
  for (let i = 0; i < ea.length; i++) {
    if (ea[i] !== eb[i]) equal = false; // no early exit
  }
  return equal;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a signed CSRF token.
 * Format: "<nonce>.<expiry>.<HMAC(nonce.expiry)>"
 *
 * The same value goes in BOTH the cookie and the response header.
 * The HMAC signature ensures an attacker cannot forge a valid token
 * without knowing NEXTAUTH_SECRET.
 */
export async function buildCsrfToken(): Promise<string> {
  const nonce  = randomHex(24);
  const expiry = Date.now() + TOKEN_TTL_MS;
  const sig    = await hmac(`${nonce}.${expiry}`);
  return `${nonce}.${expiry}.${sig}`;
}

/**
 * Validate a CSRF token (Signed Double-Submit pattern).
 *
 * Validation steps:
 *   1. Both cookie and header must be present and equal (constant-time).
 *   2. Token structure must be "<nonce>.<expiry>.<sig>".
 *   3. Expiry must not have passed.
 *   4. HMAC(nonce.expiry) must match the embedded sig (constant-time).
 */
export async function validateCsrfToken(
  cookieValue: string | undefined,
  headerValue: string | undefined,
): Promise<boolean> {
  if (!cookieValue || !headerValue) return false;

  // Step 1: cookie and header must match (Double-Submit check)
  if (!timingSafeEqual(cookieValue, headerValue)) return false;

  // Step 2: parse token structure
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return false;
  // After the length guard, all three indices are guaranteed to exist.
  // TypeScript still infers them as string|undefined from destructuring,
  // so we assert the definite string type explicitly.
  const nonce       = parts[0] as string;
  const expiryStr   = parts[1] as string;
  const receivedSig = parts[2] as string;

  // Step 3: expiry
  const expiry = parseInt(expiryStr, 10);
  if (isNaN(expiry) || Date.now() > expiry) return false;

  // Step 4: HMAC verification
  const expectedSig = await hmac(`${nonce}.${expiry}`);
  return timingSafeEqual(expectedSig, receivedSig);
}
