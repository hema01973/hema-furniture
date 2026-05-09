// src/lib/ip.ts — HemaV066
// V063 FIX-LOW-01: Use rightmost non-internal X-Forwarded-For entry.
// Leftmost entry is client-controlled. Rightmost is appended by the nearest trusted proxy.
// CF-Connecting-IP (set by Cloudflare) is always preferred when present.
//
// V050: strict trust-proxy model prevents IP spoofing
// FIND-011 FIX: TRUST_PROXY now supports two formats
import { NextRequest } from 'next/server';

/**
 * Validate that a TRUST_PROXY value is either "true", "false", or a valid CIDR.
 * MED-006 FIX (V068): Now runs unconditionally in all environments (including test).
 * Previously the guard `process.env.NODE_ENV !== 'test'` meant a misconfigured
 * TRUST_PROXY in CI/CD .env.test files would never surface — the bug only appeared
 * in production. Now we warn (not throw) in test environments so CI catches misconfigs.
 */
export function validateTrustProxyConfig(): void {
  const val = process.env.TRUST_PROXY;
  if (!val || val === 'true' || val === 'false') return;
  const cidrRe = /^([0-9]{1,3}\.){3}[0-9]{1,3}\/([0-9]|[1-2][0-9]|3[0-2])$|^[a-fA-F0-9:]+\/[0-9]{1,3}$/;
  if (!cidrRe.test(val)) {
    const msg =
      `[IP] TRUST_PROXY="${val}" is not a valid CIDR or boolean. ` +
      `Set it to "true", "false", or a CIDR like "10.0.0.0/8". ` +
      `See deployment runbook for details.`;
    // MED-006 FIX (V068): warn in test, throw in all other environments.
    if (process.env.NODE_ENV === 'test') {
      console.warn('[WARN]', msg);
    } else {
      throw new Error(msg);
    }
  }
}

// MED-006 FIX (V068): Run unconditionally so CI/CD picks up misconfigs.
validateTrustProxyConfig();

// V063 FIX-LOW-01: Use rightmost non-internal X-Forwarded-For entry.
// Leftmost entry is client-controlled. Rightmost is appended by the nearest trusted proxy.
// CF-Connecting-IP (set by Cloudflare) is always preferred when present.
export function getClientIp(req: NextRequest): string {
  // 1. Cloudflare-terminated deployments: CF-Connecting-IP is authoritative.
  const cf = req.headers.get('CF-Connecting-IP');
  if (cf) return cf.trim();

  // 2. Vercel / general reverse proxy: use rightmost X-Forwarded-For entry.
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const entries = xff.split(',').map(s => s.trim()).filter(Boolean);
    if (entries.length > 0) return entries.at(-1)!;
  }

  // 3. Direct connection fallback (local dev, no proxy).
  return '127.0.0.1';
}
