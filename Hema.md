# HemaV040 — Security Fixes & Dependency Changelog

**Date:** 2026-05-02  
**Base version:** HemaV039 (39.0.0)  
**Release version:** HemaV040 (40.0.0)  
**Audit reference:** HemaV040_Security_Audit — Overall score 93/100 (+5 from V038)

---

## Summary of Changes

| Ref | Severity | File(s) Changed | Status |
|---|---|---|---|
| HIGH-01 | 🔴 High | `src/app/(store)/success/page.tsx` | ✅ Fixed |
| MED-01 | 🟡 Medium | `src/lib/validators.ts` *(new)*, `src/app/api/v1/products/route.ts`, `src/app/api/v1/products/[id]/route.ts`, `src/app/api/v1/reviews/route.ts` | ✅ Fixed |
| MED-02 | 🟡 Medium | `src/app/api/v1/orders/track/route.ts` | ✅ Fixed |
| MED-03 | 🟡 Medium | `src/app/api/auth/verify-email/route.ts` | ✅ Fixed |
| LOW-01 | 🟢 Low | `vercel.json` / `.gitignore` | ⚠️ Noted (git history action required) |
| LOW-02 | 🟢 Low | `src/app/api/auth/mfa/verify/route.ts` | ✅ Fixed |
| LOW-03 | 🟢 Low | `package.json` | ✅ Fixed |
| DEP | — | `package.json` | ✅ Unified |

---

## Detailed Changes

---

### HIGH-01 — Stored XSS / URL Injection on `/success` Page

**File:** `src/app/(store)/success/page.tsx`

**Problem:** The `orderNum` variable was read directly from `?order=` query string and rendered as JSX with no format validation. An attacker could craft a URL with an arbitrary string rendered verbatim — enabling phishing via fake order status messages, unicode bidirectional override attacks, or content injection on a trusted domain. Any future use of this value via `dangerouslySetInnerHTML` (e.g. in email templates) would become direct XSS.

**Fix:**
```tsx
// BEFORE
const orderNum = searchParams.get('order') ?? '';

// AFTER
const rawOrderNum = searchParams.get('order') ?? '';
const orderNum = /^HEM-\d{4}-\d{5}$/.test(rawOrderNum) ? rawOrderNum : '';
```

The value is validated against the canonical `HEM-YYYY-NNNNN` format before any rendering. An invalid value silently degrades to an empty string, showing a generic confirmation — which is the correct UX fallback since the legitimate Paymob callback always produces a well-formed order number.

---

### MED-01 — Product Image URLs Lacked Domain Allowlist (SSRF / Content Injection)

**Files:**
- `src/lib/validators.ts` — **new shared file**
- `src/app/api/v1/products/route.ts` — `CreateProductSchema.images`
- `src/app/api/v1/products/[id]/route.ts` — `UpdateProductSchema.images` (refactored)
- `src/app/api/v1/reviews/route.ts` — `CreateReviewSchema.images` (refactored)

**Problem:** Both product schemas (`CreateProductSchema` and `UpdateProductSchema`) accepted `images` as `z.array(z.string().url())` with no domain restriction. The reviews endpoint already had the correct `isAllowedImageUrl()` guard, but product endpoints did not. A compromised admin session could set a product image URL to an attacker-controlled server, enabling tracking pixels, referrer-based deanonymisation, and — if the hostname were ever added to Next.js `remotePatterns` — full SSRF via the image optimizer. The three files each duplicated the same `ALLOWED_IMAGE_DOMAINS` constant and `isAllowedImageUrl()` function independently, creating a maintenance risk where one copy could drift.

**Fix:**

1. **New shared file `src/lib/validators.ts`** — single source of truth for `isAllowedImageUrl()`:

```typescript
const ALLOWED_IMAGE_DOMAINS = ['res.cloudinary.com', 'images.unsplash.com', 'placehold.co'] as const;

export function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_IMAGE_DOMAINS.some(
      domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );
  } catch { return false; }
}
```

2. **`products/route.ts` — `CreateProductSchema`:** Added `.refine(isAllowedImageUrl, ...)` to the images field. The local placeholder default (`/images/product-placeholder.svg`) is unaffected — Zod `.default()` is applied before per-element validation and bypasses refinements by design.

3. **`products/[id]/route.ts` — `UpdateProductSchema`:** Removed the locally-defined `ALLOWED_IMAGE_DOMAINS` constant and `isAllowedImageUrl` function. Now imports from `@/lib/validators`.

4. **`reviews/route.ts` — `CreateReviewSchema`:** Removed the locally-defined duplicate. Now imports from `@/lib/validators`.

---

### MED-02 — Guest Order Tracking Exposed Full Shipping Address

**File:** `src/app/api/v1/orders/track/route.ts`

**Problem:** `GUEST_PROJECTION` included `shippingAddress`, `customer.name`, and `notes`. The order number search space is only 100,000 values per year (`HEM-YYYY-00001` to `HEM-YYYY-99999`). An attacker with a victim's email from a public breach could brute-force order numbers over time (with IPv6 rotation to bypass per-IP rate limits) and harvest full home addresses and purchase history.

**Fix:** Removed `shippingAddress`, `customer.name`, `notes`, `subtotal`, `shipping`, `discount`, and `updatedAt` from the guest projection. The guest only needs order status, payment status, items, total, and creation date for a tracking experience — they already know their own address.

```typescript
// BEFORE — over-permissive projection
const GUEST_PROJECTION = {
  orderNumber: 1, status: 1, paymentStatus: 1, paymentMethod: 1,
  items: 1, subtotal: 1, shipping: 1, discount: 1, total: 1,
  shippingAddress: 1,   // ← full street address
  'customer.name': 1,   // ← customer PII
  notes: 1, createdAt: 1, updatedAt: 1,
};

// AFTER — minimal projection
const GUEST_PROJECTION = {
  orderNumber: 1, status: 1, paymentStatus: 1,
  paymentMethod: 1, items: 1, total: 1, createdAt: 1,
};
```

---

### MED-03 — No Rate Limit on `/api/auth/verify-email` GET Endpoint

**File:** `src/app/api/auth/verify-email/route.ts`

**Problem:** The GET handler (token confirmation) was the only auth-adjacent endpoint missing rate limiting. Every other auth endpoint — register, login, forgot-password, change-password, MFA verify — has explicit `rateMax`/`rateWindow` options. The missing limit enabled: DB flood via request flooding, timing-based probing to infer whether a given email recently registered, and a violation of the project's established security baseline.

**Fix:** Added rate limit options to the GET handler:

```typescript
// BEFORE
export const GET = withErrorHandler(async (req: NextRequest) => {
  // ...handler...
});

// AFTER
export const GET = withErrorHandler(async (req: NextRequest) => {
  // ...handler...
}, { failClosed: false, rateMax: 10, rateWindow: 600 });
```

`failClosed: false` — a Redis outage must never block a legitimate user from verifying their email. 10 requests per 10 minutes per IP is generous for legitimate use (one click + a few retries) while preventing enumeration and flood attacks.

---

### LOW-01 — `vercel.json` in Repository (Git History Exposure)

**File:** `vercel.json` / `.gitignore`

**Status:** ⚠️ Partially addressed — git history action required.

**Problem:** `vercel.json` was added to `.gitignore` in HemaV035, but the file still exists in the V039 filesystem snapshot. If it was ever committed before being ignored, it permanently exists in git history, exposing the cron path (`/api/cron/cleanup`), all function routes with their `maxDuration` timeouts, and environment variable names.

**Required actions (not automatable in a code diff):**
1. Run `git log --all -- vercel.json` to determine whether the file was ever committed.
2. If yes: **rotate `CRON_SECRET` immediately**, then purge the file from git history using `git filter-repo --path vercel.json --invert-paths`.
3. Manage `vercel.json` via the Vercel dashboard or inject it only during CI/CD deployment — never commit it to the repository.

The `.gitignore` entry (`vercel.json`) is already correct in V039 and was not changed.

---

### LOW-02 — TOTP Codes Replayable Within 30-Second Window

**File:** `src/app/api/auth/mfa/verify/route.ts`

**Problem:** `otplib`'s `authenticator.verify()` validates T-1, T, and T+1 TOTP windows (~90 seconds total). A successfully verified TOTP code was never blacklisted after use. Within the same ~90-second window, the same OTP code could be presented multiple times and would pass on each attempt. This enables real-time phishing proxy attacks (e.g. Evilginx2) where a captured session is not invalidated if the victim also logs in within the same window.

**Fix:** Imported `getRedis` and added a Redis-backed replay blacklist after a successful TOTP verification. The key `mfa:used:{userId}:{token}` is set with a 90-second TTL (matching the TOTP validity window). The check fails open if Redis is unavailable — service availability is prioritised over replay protection in the rare Redis-down scenario:

```typescript
if (validTotp) {
  const redis = await getRedis();
  if (redis) {
    const replayKey = `mfa:used:${user._id}:${v.data.token}`;
    const alreadyUsed = await redis.get(replayKey).catch(() => null);
    if (alreadyUsed) {
      return err('TOTP code already used — wait for the next code', 400);
    }
    await redis.setex(replayKey, 90, '1').catch(() => {});
  }
}
```

---

### LOW-03 — `next-auth` Unpinned Pre-Release Dependency

**File:** `package.json`

**Problem:** `"next-auth": "^5.0.0"` automatically installs any future `5.x` release, including unstable release candidates, without explicit human review. Auth.js v5 is still in release-candidate status as of May 2026. An auto-upgraded RC with a regression in JWT verification or session handling would silently affect production.

**Fix:** Pinned to the exact current RC version:

```json
// BEFORE
"next-auth": "^5.0.0"

// AFTER
"next-auth": "5.0.0-beta.28"
```

**Recommendation:** Add a Dependabot alert for `next-auth` requiring manual security review before any upgrade. Monitor https://github.com/nextauthjs/next-auth/releases and upgrade deliberately when GA is released.

---

## Dependency Version Unification

**File:** `package.json`

The following structural cleanups were applied to unify dependency organisation:

| Change | Reason |
|---|---|
| `"typescript": "^5.7.0"` moved from `dependencies` → `devDependencies` | TypeScript is a build-time tool, not a runtime dependency. Having it in `dependencies` causes it to be installed in production Docker images unnecessarily and inflates the production bundle size. |
| `"@node-rs/argon2": "^2.0.0"` moved to alphabetical order within `dependencies` | Cosmetic — consistent ordering makes dependency audits easier. |
| `"next-auth"` pinned to exact version `5.0.0-beta.28` | See LOW-03 above. |

All other `^` semver ranges are retained as-is — they are consistent across the file and represent stable, GA-released packages where range tracking is appropriate.

---

## New File

| File | Purpose |
|---|---|
| `src/lib/validators.ts` | Shared `isAllowedImageUrl()` function — single source of truth for the image domain allowlist used by product create, product update, and review endpoints. Eliminates three copies of identical code that could drift independently. |

---

## Security Score Impact

| Version | Score | Critical | High | Medium |
|---|---|---|---|---|
| V039 (input) | 93/100 | 0 | 1 | 3 |
| **V040 (this release)** | **~97/100** | **0** | **0** | **0** |

All P0–P2 findings are resolved. The remaining LOW-01 (git history purge) requires a manual git operation outside the scope of a code diff.

---

*END OF CHANGELOG — HemaV040*
