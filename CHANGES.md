# Production Audit & Fix — Hema Modern Furniture v2.0

## 🔴 Critical Bugs Fixed

### 1. BUILD FAILURE — Missing `dompurify` + `jsdom` Dependencies
**Problem:** `email.ts` imported `dompurify` and `jsdom` but these packages were absent from `package.json`.  
**Impact:** `npm run build` would fail immediately in CI/CD.  
**Fix:** Added `dompurify@^3.1.6`, `jsdom@^24.1.0`, `@types/dompurify`, `@types/jsdom` to `package.json`.

### 2. ORDER NUMBER RACE CONDITION (`countDocuments`)
**Problem:** `OrderSchema.pre('save')` used `countDocuments()` to generate order numbers. Under concurrent load two requests could read the same count and produce duplicate order numbers, violating the unique constraint.  
**Fix:** `src/lib/mongodb.ts` — Added `Counter` model with `nextSeq()` using `findByIdAndUpdate($inc)`, a MongoDB atomic operation guaranteed to return unique sequential values:
```ts
export async function nextSeq(name: string): Promise<number> {
  const doc = await Counter.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return doc.seq;
}
```

### 3. CSP `unsafe-inline` + `unsafe-eval` IN PRODUCTION
**Problem:** The same CSP was used in both dev and production, including `script-src 'unsafe-eval' 'unsafe-inline'`, making XSS trivial.  
**Fix:** `src/middleware.ts` — Per-request cryptographic nonces (`randomBytes(16)`) plus environment branching:
- **Production:** `script-src 'self' 'nonce-{nonce}' https://accept.paymob.com` — no unsafe directives.
- **Development:** `unsafe-eval` still present (required by Next.js HMR).

### 4. RATE LIMITING FAILS OPEN (CRITICAL AUTH ENDPOINT)
**Problem:** If Redis was unavailable, ALL rate limits silently fell back to in-memory counters. On multi-instance deployments this meant auth endpoints had effectively no protection.  
**Fix:** `src/lib/redis.ts` + `src/lib/api.ts` — New `failClosed` parameter:
```ts
// Auth routes: block if Redis is down
withErrorHandler(handler, { failClosed: true, rateMax: 5, rateWindow: 900 })

// General routes: allow through if Redis is down (no degraded UX)
withErrorHandler(handler) // failClosed defaults to false
```
Auth endpoints (`/forgot-password`, `/reset-password`, `/mfa/verify`) all use `failClosed: true`.

---

## 🟠 High Priority Features Added

### 5. EMAIL VERIFICATION FLOW
**Files:** `src/app/api/auth/verify-email/route.ts`, `src/app/(auth)/verify-email/page.tsx`

- `GET /api/auth/verify-email?token=xxx` — validates SHA-256-hashed token (24 hour expiry), activates account.
- `POST /api/auth/verify-email` — resends verification (fail-closed, 5 req/hour).
- Raw token never stored — only its SHA-256 hash in DB.
- Registration now creates `emailVerificationToken` + `emailVerificationExpires`.

### 6. PASSWORD RESET FLOW
**Files:** `src/app/api/auth/forgot-password/route.ts`, `src/app/api/auth/reset-password/route.ts`, pages.

- **Email enumeration safe:** always returns the same success message regardless of whether email exists.
- Token: 32 random bytes, SHA-256 hashed before storage, 1 hour expiry.
- Rate limited **fail-closed** (5 requests/15 minutes).
- Reset clears `failedLogins` and `lockedUntil`.

### 7. MFA / TOTP
**Files:** `src/app/api/auth/mfa/setup/route.ts`, `src/app/api/auth/mfa/verify/route.ts`

- TOTP via `speakeasy`, QR code via `qrcode`.
- Setup: GET generates secret → POST verifies first code → activates + generates 8 SHA-256-hashed backup codes.
- Verify: TOTP window ±1 step OR backup code (one-time use).
- Account lockout: 5 failed attempts → 15 min lock.

### 8. ACCOUNT / PROFILE PAGE (was empty directory)
**File:** `src/app/(store)/account/page.tsx`, `src/components/account/AccountPage.tsx`

Full account dashboard with:
- Profile: name, phone (update via API).
- Orders: last 5 with status badges.
- Security: change password link + sign out.

### 9. REVIEWS SECTION INTEGRATED
**File:** `src/components/product/ReviewsSection.tsx` integrated into `ProductDetailPage.tsx`

- Star picker, rating distribution bar chart, write-review form (min 10 chars).
- Verified Purchase badge auto-assigned on submission.
- Product `rating` + `reviewCount` updated via MongoDB aggregation after each review.

### 10. ORDER TRACKING PAGE
**Files:** `src/app/(store)/track/[orderNumber]/page.tsx`, `src/components/account/OrderTrackingPage.tsx`

- Visual 6-step progress bar: Placed → Confirmed → Processing → Shipped → Out for Delivery → Delivered.
- `statusHistory` timeline (each status change stored automatically via `OrderSchema.pre('save')`).
- `trackingNumber` and `trackingUrl` (carrier link) displayed.
- Cancelled orders shown separately.

---

## 🟢 Resilience & Performance

### 11. BULLMQ EMAIL QUEUE
**Files:** `src/lib/queue.ts`, `src/workers/emailWorker.ts`

All 6 email types queued via BullMQ with **3 retry attempts** + exponential back-off (5s, 10s, 20s):
`orderConfirmation`, `welcome`, `verification`, `passwordReset`, `paymentFailed`, `adminPaymentAlert`.

Fallback: direct send if Redis/BullMQ unavailable.

Run worker: `npm run worker`

### 12. PAYMENT FAILURE — ADMIN ALERT + USER RETRY
**Files:** `src/app/api/orders/route.ts`, `src/components/account/OrdersPage.tsx`

When Paymob session creation fails after order commit:
1. `paymentStatus → 'failed'`, `paymentFailureNotified → true`.
2. Customer email: "Payment failed, retry from orders page."
3. Admin alert email with order details and error reason.
4. "Retry Payment" button appears in OrdersPage for failed/pending online orders.
5. Modal iframe reopens fresh Paymob session without creating a new order.

### 13. STATUS HISTORY AUDIT TRAIL
**File:** `src/lib/mongodb.ts`

`OrderSchema.pre('save')` automatically appends to `statusHistory[]` on every status change — no manual tracking needed.

---

## Architecture Summary

```
src/
├── app/
│   ├── (auth)/              login, register, forgot-password, reset-password, verify-email
│   ├── (store)/             home, shop, product/[slug], cart, checkout, orders,
│   │                        success, account, track/[orderNumber]
│   ├── admin/               dashboard (real analytics), products, orders, users
│   └── api/
│       ├── auth/            nextauth, register, verify-email, forgot-password,
│       │                    reset-password, mfa/setup, mfa/verify
│       ├── products/        GET(public,faceted) POST(admin)  [id] CRUD
│       ├── orders/          GET(auth) POST(public+auth) [id] GET/PUT/DELETE retry-payment
│       ├── users/           GET(admin) [id] GET/PUT/PATCH/DELETE wishlist
│       ├── reviews/         GET(public) POST(auth+purchase-check)
│       ├── upload/          POST(admin, Cloudinary)
│       ├── analytics/       GET(admin, MongoDB aggregations)
│       ├── coupons/         POST(validate)
│       └── paymob/callback/ POST(HMAC verified) GET(browser redirect)
├── lib/
│   ├── mongodb.ts   Counter+nextSeq, Product, Order+statusHistory, User+MFA, Review, Coupon
│   ├── auth.ts      NextAuth config, requireAuth, requireAdmin, hashPassword
│   ├── api.ts       ok/err/withAuth/withErrorHandler(failClosed), validateBody, pagination
│   ├── redis.ts     Singleton + sliding-window rateLimit(failClosed) + cache helpers
│   ├── queue.ts     BullMQ enqueueEmail + direct fallback
│   ├── email.ts     6 templates: order, welcome, verification, reset, payment, admin alert
│   ├── cloudinary.ts image upload + optimize
│   └── paymob.ts   3-step session + HMAC webhook verify
├── middleware.ts    Nonce CSP, route protection, security headers, HSTS
├── store/cartStore.ts Zustand: cart+wishlist+UI (localStorage persisted)
└── workers/emailWorker.ts BullMQ processor (npm run worker)
```

## Quick Start

```bash
npm install
cp .env.example .env.local    # Fill: MONGODB_URI, NEXTAUTH_SECRET, NEXTAUTH_URL
npm run seed                  # Seed 10 products + admin user + coupons
npm run dev                   # Next.js dev server → http://localhost:3000
npm run worker                # Email queue worker (separate terminal)
```

**Admin:** `admin@hemafurniture.com` / `admin123`  
**Change password immediately after first login!**

## Deployment (Vercel)

```bash
npm run build                 # Verify no TypeScript errors
npm run typecheck
vercel --prod                 # Deploy
```

Set all `.env.example` variables in Vercel Dashboard → Settings → Environment Variables.
