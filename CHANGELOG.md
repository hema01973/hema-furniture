## [0.69.0] — 2026-05-08

### Security Fixes (Critical)
- **CRIT-001**: Replaced `requireRole('admin')` with `requirePermission('change:role')` in both admin role routes (`/api/v1/admin/users/[id]/roles` POST & DELETE). `requireRole()` bypassed the central `authz.ts` RBAC catalog — any future RBAC changes would not propagate to these routes.
- **CRIT-002**: Removed IP loopback bypass from `isPrivilegedHealthCaller()` in `/api/healthz`. Any pod in the internal network could spoof `X-Forwarded-For: 127.0.0.1` to obtain verbose infrastructure data without a secret. `METRICS_SECRET` bearer token is now unconditionally required.
- **CRIT-003**: Added `auth.length !== expected.length` check before `timingSafeEqual` buffer write in `/api/cron/cleanup`. Any payload sharing the first 512 bytes with a valid Bearer token previously passed silently (truncation buffer vulnerability).

### Security Fixes (High)
- **HIGH-001**: Activated Vercel cron IP allowlisting in `vercel.json` with actual Vercel cron service IPs. Previously only a comment instructed operators to add this — the restriction was never enforced.
- **HIGH-002**: Replaced `console.warn` with `logger.warn` for CSRF_SECRET fallback warning in `csrf.ts`. The critical security alert was invisible to BetterStack/Axiom monitoring.
- **HIGH-003**: Added Redis-backed rate limiting (10 attempts / 5-minute window per IP) on `/api/auth/callback/credentials` in `middleware.ts`. Prevents credential-stuffing attacks that previously bypassed all rate limits.
- **HIGH-004**: Replaced full-entity update in `MongoUserRepository.save()` with explicit field whitelist (`name, phone, avatar, addresses`). Previously, sensitive fields (`role`, `isActive`, `failedLogins`) could be modified via user-facing endpoints.
- **HIGH-005**: Added `AUDIT_HMAC_SECRET` to `REQUIRED_IN_PRODUCTION` and `SecretName` type in `secrets.ts`. Production deployments without this secret now fail at startup — protects audit log integrity chain (PCI-DSS compliance).

### Security Fixes (Medium)
- **MED-002**: Added explicit type guard in `sanitizeQuery()` — non-string inputs now return `''` immediately. Previously Arrays/Objects were coerced to strings, masking injection attempts.
- **MED-005**: `requireRole.ts` now throws at import time with a clear migration message. Module is fully retired; `requirePermission()` from `authz.ts` is the single RBAC authority.
- **MED-006**: Routed SWR client-side errors through `logger.warn` with PII redaction in production. `console.error` was bypassing the structured logging pipeline.

### Reliability Improvements
- **LOW-003**: Applied `withDbRetry()` to `decrementStock()` and `incrementStock()` in `MongoProductRepository`. These high-sensitivity concurrent operations now survive transient DB failures without phantom stock loss.
- **LOW-007**: Added `updateMany` and `deleteMany` to the global `maxTimeMS` Mongoose plugin. Cron cleanup operations can no longer hang indefinitely under DB load.

### Version Unification
- **LOW-005**: Unified `NEXT_PUBLIC_APP_VERSION` to `0.69.0` across `package.json`, `VERSION`, `.env.example`, and `.env.production.template` (previously mismatched at `0.62.0` and `0.68.0`).

---

## [0.68.0] — 2026-05-08

### Security Fixes (Critical)
- **VULN-001**: QStash email worker now performs real HMAC-SHA-256 signature verification using `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY`. Previously only checked header presence, allowing anyone to forge arbitrary email jobs (phishing-quality password resets, spam).
- **VULN-002**: Newsletter unsubscribe tokens now use a dedicated `NEWSLETTER_UNSUBSCRIBE_SECRET` with fallback to `NEXTAUTH_SECRET`. Rotating `NEXTAUTH_SECRET` no longer invalidates outstanding 30-day unsubscribe links (CAN-SPAM/GDPR compliance fix).
- **VULN-003**: TOTP MFA window explicitly set to `window: 0` in both setup and verify routes. Eliminates the default ±1 step (90-second) validity window — only the current 30-second step is accepted.
- **VULN-004**: MFA in-memory replay cache overflow now uses LRU eviction (oldest entry deleted) instead of clearing the entire cache. Clearing all entries created a ~120s window where used TOTP codes could be replayed.

### Security Fixes (High)
- **HIGH-001**: Vercel cron IP allowlist documentation added to `vercel.json`. Operators must configure Vercel cron trusted IPs per the runbook.
- **HIGH-002**: `secrets/rotate` route now uses `getClientIp()` (rightmost XFF / CF-Connecting-IP) instead of the broken `getIp()` function that read the leftmost (client-controlled) `X-Forwarded-For` entry. Audit logs now contain the real IP.
- **HIGH-003**: `admin/feature-flags` POST now uses `validateBody()` instead of `req.json()` directly — enforces 1MB body-size limit and `Content-Type: application/json` check, preventing DoS via memory exhaustion.
- **HIGH-004**: Guest order tracking endpoint no longer exposes `items` array or `paymentMethod` to unauthenticated callers. Only `orderNumber`, `status`, `paymentStatus`, `total`, and `createdAt` are returned.

### Security Fixes (Medium)
- **MED-001**: `admin/users` route migrated from `requireRole('admin')` to `requirePermission('read:user:any')` — aligned with centralized RBAC architecture.
- **MED-002**: Password reset route now checks against `COMMON_PASSWORDS` blocklist. NIST SP 800-63B §5.1.1.2 requires this check at ALL password-setting entry points, not just registration.
- **MED-003**: Customer order listing now returns accurate per-user `total` via `countDocuments({ userId })` instead of `estimatedDocumentCount()` which returned the collection-wide count, breaking frontend pagination.
- **MED-006**: `validateTrustProxyConfig()` in `ip.ts` now runs in all environments including test. Warns (not throws) in `NODE_ENV=test` so CI/CD catches misconfigs before production deployment.

### Security Fixes (Low / Architecture)
- **LOW-003**: `withErrorHandler()` now applies conservative defaults of 60 req/60s when no `rateMax`/`rateWindow` is specified. Previously unspecified routes had no rate limiting.
- **LOW-004**: Audit log chain hash now covers full entry content (`action | userId | resourceId | details | createdAt`) instead of just `_id`. Content tampering is now detectable.
- **LOW-005**: Removed stale `_securityNotes` key from `package.json` that referenced the old `next-auth@5.0.0-beta.28`. `next-auth` is now stable `^5.0.0`.
- **LOW-006**: `cron/cleanup` steps 1 & 2 documented as idempotent — partial completion is safely recoverable by the next scheduled run.
- **LOW-007**: Added `next.config.js` documentation clarifying that middleware-injected CSP (with nonce) applies to all HTML responses; static assets are excluded by design.
- **ARCH-002**: `admin/roles` route migrated from `requireRole()` to `requirePermission('read:admin')`. `requireRole.ts` is now unused by all routes and marked deprecated.

### Environment Variables Added
- `QSTASH_CURRENT_SIGNING_KEY` — **Required** for QStash signature verification (VULN-001)
- `QSTASH_NEXT_SIGNING_KEY` — **Required** for zero-downtime key rotation (VULN-001)
- `NEWSLETTER_UNSUBSCRIBE_SECRET` — Recommended dedicated secret for unsubscribe tokens (VULN-002)


## [0.66.0] — 2026-05-07

### Security Fixes

#### 🔴 Critical
- **CRIT-01**: User `DELETE` now cascades inside a Mongoose multi-document transaction — Orders anonymised (`userId → '[deleted]'`), Reviews hard-deleted, AuditLog entries anonymised. Fixes GDPR Article 17 ("right to erasure") violation and eliminates referential ghost data. (`src/app/api/v1/users/[id]/route.ts`)

#### 🟠 High
- **HIGH-01**: Fixed `ok()` called with `{ rateMax, rateWindow }` object as second argument in `DELETE` handler — runtime was sending `status: '[object Object]'`. Rate limit options moved to `withErrorHandler()` where they belong. (`src/app/api/v1/users/[id]/route.ts`)
- **HIGH-02**: Audit-log date parameters (`from`/`to`) now validated with `isNaN(date.getTime())` before use — prevents NaN injection into MongoDB `$gte`/`$lte` operators. Returns HTTP 422 on invalid format. (`src/app/api/v1/admin/audit-logs/route.ts`)
- **HIGH-04**: Added eager secrets cache warm-up in `instrumentation.ts` — all `REQUIRED_IN_PRODUCTION` secrets are pre-fetched at startup. Prevents `getSecretSync()` cold-start fallback to pre-rotation `process.env` values in Edge instances after a key rotation. (`src/instrumentation.ts`)

#### 🟡 Medium
- **MED-02**: Guest order claim tokens now signed/verified with dedicated `CLAIM_TOKEN_SECRET` (falls back to `NEXTAUTH_SECRET` for backward compat). `NEXTAUTH_SECRET` rotations no longer invalidate outstanding 7-day claim tokens. (`src/app/api/v1/orders/route.ts`, `src/app/api/v1/orders/claim/[token]/route.ts`, `src/lib/secrets.ts`)
- **MED-03**: Added clear documentation in middleware clarifying the in-memory edge burst maps provide no protection in multi-instance deployments. Redis-backed per-route limiters are the only authoritative distributed rate limiters. (`src/middleware.ts`)
- **MED-04 + ADV-01**: `secrets.ts` — `Provider` type narrowed to `'env' | 'aws'` only. Setting `SECRETS_PROVIDER=vault` or `SECRETS_PROVIDER=gcp` now throws immediately in all environments (fail-closed), instead of silently reading from `process.env`. (`src/lib/secrets.ts`)
- **MED-05**: Added common password dictionary check (`COMMON_PASSWORDS` set) to `RegisterSchema` with `.refine()`. Satisfies NIST SP 800-63B §5.1.1.2 requirement to reject known compromised passwords. (`src/app/api/auth/register/route.ts`)

#### 🟢 Low
- **LOW-01**: Added operator advisory comments to cron/cleanup and metrics routes documenting Vercel cron IP allowlisting steps. (`src/app/api/cron/cleanup/route.ts`, `src/app/api/metrics/route.ts`)
- **LOW-02**: Admin user list (`GET /api/v1/users`) migrated to cursor-based pagination — matches pattern already in `orders/route.ts` and `audit-logs/route.ts`. Skip/limit O(N) path retained for backward compatibility. (`src/app/api/v1/users/route.ts`)
- **LOW-03**: `_localDenialCounts` fallback map in `authz.ts` now has LRU eviction — after expiry-pruning, if still at capacity, evicts the entry with the lowest count. Prevents self-DoS where new subjects couldn't get a counter slot during an active burst. (`src/lib/authz.ts`)
- **LOW-04**: `sanitizeRich()` in `sanitize.ts` now has full JSDoc security contract documenting ALLOWED_ATTR restriction and XSS risks. New `sanitizeInline()` variant for contexts requiring inline-only HTML (no block elements). (`src/lib/sanitize.ts`)
- **LOW-05**: Product SKU generation replaced `Product.countDocuments()` with atomic `nextSeq('product')` — eliminates race condition under concurrent admin inserts. (`src/app/api/v1/products/route.ts`)

#### 🔵 Advisory
- **ADV-02**: `order.service.ts` — `enqueueEmail` queue type updated to accept `IOrder | EmailOrderPayload` union, eliminating the `as unknown as IOrder` type-system bypass. (`src/services/order.service.ts`, `src/lib/queue.ts`)
- **ADV-03**: Paymob IP allowlist ranges noted as requiring quarterly verification in comments. Operator action required.

### Version Unification
- All source file headers updated from `HemaV065`/`HemaV064`/`HemaV063` → `HemaV066`
- `package.json` version: `0.65.0` → `0.66.0`
- `VERSION` file: `0.65.0` → `0.66.0`
- Sentry release strings updated to `0.66.0`
- `CLAIM_TOKEN_SECRET` added to `SecretName` type in `src/lib/secrets.ts`

### Operator Actions Required (not code changes)
- Add `CLAIM_TOKEN_SECRET` env var (independent secret, 90+ day rotation schedule)
- Add Vercel cron IP allowlisting in `vercel.json` for `/api/cron/cleanup`
- Verify Paymob IP CIDR ranges quarterly (last verified 2025-01-15)
- Migrate to stable next-auth v5 when released (HIGH-03)


## [0.6.3] — HemaV063 (2026-05-07)

### Security Fixes Applied

- **CRIT-01** — Paymob callback: fail-closed when client IP cannot be determined (was fail-open).
- **CRIT-02** — Order status query param: strict enum validation before MongoDB filter injection.
- **CRIT-03** — CORS: fail-closed when `allowedOrigins` is empty (applied in OPTIONS preflight and response headers).
- **HIGH-01** — NextAuth beta: explicit production startup warning; `next-auth@5.0.0-beta.28` pinned in `package.json` overrides.
- **HIGH-02** — Audit integrity endpoint: default scan limit reduced 10k→1k, cap reduced 50k→5k; cursor pagination via `afterId` param added; `verifyAuditLogIntegrity()` updated to accept filter + return `nextCursor`.
- **HIGH-03** — Edge burst limiter: IP and user tracking split into separate maps (`_edgeBurstIp` / `_edgeBurstUser`); hard-reject when map is at capacity after eviction.
- **HIGH-04** — `sanitizeQuery`: extended regex to strip null bytes, pipe character, and collapse repeated dots (traversal prevention).
- **MED-01** — Paymob callback: `getCallbackIp()` now uses rightmost `X-Forwarded-For` entry (proxy-appended, not client-controlled).
- **MED-02** — `CRON_SECRET` and `METRICS_SECRET` added to `REQUIRED_IN_PRODUCTION` in `secrets.ts`.
- **MED-03** — Admin feature-flags GET and POST: rate limits added (`rateMax: 20, rateWindow: 60`).
- **MED-04** — Admin users GET: rate limit added (`rateMax: 30, rateWindow: 60`).
- **MED-05** — Admin audit-logs GET and admin reviews GET: rate limits added (`rateMax: 20, rateWindow: 60`).
- **MED-06** — Users route: `staff` role alias normalized to `manager` in DB filter; legacy records with `role: 'staff'` are included in manager-tier results.
- **LOW-01** — `getClientIp()` in `ip.ts`: switched to rightmost `X-Forwarded-For` strategy (consistent with Paymob MED-01 fix).
- **LOW-02** — `_localDenialCounts` in `authz.ts`: eviction logic added when map exceeds `LOCAL_DENIAL_MAP_MAX` (10,000 entries).
- **LOW-03** — `auth.ts`: static all-zero argon2 dummy hash replaced with runtime-computed hash at module load time.
- **LOW-04** — `vercel.json`: added `X-DNS-Prefetch-Control: off` and `X-Permitted-Cross-Domain-Policies: none` to global headers rule.
- **LOW-05** — `scripts/seed.ts`: production guard added; `SEED_ADMIN_PASSWORD` env var now required; hardcoded password default removed.
- **LOW-06** — `scripts/backup.sh`: backup archive encrypted with AES-256-GCM before S3 upload; `BACKUP_ENCRYPTION_KEY` required. `scripts/restore.sh`: decrypts before extracting.

# [58.0.0] — HemaV058 (2026-05-06)

## Security & Reliability Fixes

- **FIX-001 — Version Unification**: Bumped to `58.0.0` / `0.58.0` across `package.json`, `VERSION`, `instrumentation.ts` (both runtimes), `.env.example`, and `.env.production.template`. Eliminates Sentry release misattribution risk.
- **FIX-002 — Circuit Breaker Dead Variable** (`src/lib/circuit-breaker/index.ts`): `wasAlreadyOpen` was hardcoded to `false` (dead variable). Fixed to `stats.state === 'OPEN'` captured *before* the state assignment. Prevents duplicate Slack alerts on HALF_OPEN→OPEN transitions if the early-exit guard is ever changed. Also logs `priorState` for better observability.
- **FIX-003 — Rate Limiting on `/api/secrets/rotate`** (`src/app/api/secrets/rotate/route.ts`): Added per-IP rate limiting (10 req/min, `failClosed=true`). Even with `ROTATION_WEBHOOK_SECRET` protection, a sustained brute-force was possible with no throttling. Now returns RFC 6585-compliant `Retry-After` header on 429.
- **FIX-004 — LOW-03 Advisory Log at Startup** (`src/instrumentation.ts`): Added a production startup `console.warn` when `ROTATION_WEBHOOK_SECRET` is absent (regardless of `SECRETS_PROVIDER`). Closes the accepted LOW-03 risk from V057 where operators could silently deploy without knowing the endpoint will reject all calls.
- **FIX-005 — Sentry Alert on MFA Replay Cache Overflow** (`src/app/api/auth/mfa/verify/route.ts`): Added `Sentry.captureMessage` alongside `logger.warn` when the in-memory MFA replay cache overflows. The overflow clears the cache, creating a brief replay window if Redis is also down. Operators now see a Sentry warning-level alert, not just a log entry.
- **FIX-006 — Unit Tests for V057+V058 Fixes** (`__tests__/unit/v058-fixes.test.ts`): Added comprehensive tests covering:
  - `ROTATION_WEBHOOK_SECRET` schema enforcement (accepted/rejected by length)
  - `timingSafeCompare` rejects different-length strings (V057 FIX-004 coverage)
  - Circuit breaker `alertCircuitOpen` fires exactly once on CLOSED→OPEN transition
  - `VERSION` file and `package.json` version consistency

# [46.0.0] — HemaV046 (2026-05-04)

## Weakness Remediation

- **Repository Pattern Complete** — All 5 domain entities (`Order`, `User`, `Coupon`, `Review`, `Product`) now have full domain interfaces and MongoDB implementations. Added `IUserRepository`, `ICouponRepository`, `IReviewRepository` and corresponding `MongoOrderRepository`, `MongoUserRepository`, `MongoCouponRepository`, `MongoReviewRepository`. Added barrel export at `src/infrastructure/repositories/index.ts`.
- **QStash Made Optional** — `QSTASH_TOKEN` is no longer required in production. The email queue now auto-detects strategy: QStash when the token is present, in-process exponential-backoff retry queue (5 attempts, 5s→80s) when it is not. Graceful fallback on QStash errors. No Upstash account required.
- **Test Coverage Expanded** — Added 6 new test files (5 suites, ~60 test cases) covering all new repositories, the queue refactor, and the feature flags system. Total test files: 65 (was 59).
- **Feature Flags Admin UI** — Full visual management page at `/admin/feature-flags`. Includes stats bar, category grouping, toggle switches with optimistic updates, maintenance-mode confirmation dialog, search/filter, and 30s auto-refresh. Navigation link added to admin sidebar.

## Version Consistency
- `VERSION` → `46.0.0`
- `package.json` → `"version": "46.0.0"`

---

# [45.0.0] — HemaV045 (2026-05-03)

## New Features & Improvements
- **Serverless Queue Migration** — Replaced BullMQ with Upstash QStash for serverless-native email processing.
- **Dynamic Worker Concurrency** — Added `EMAIL_WORKER_CONCURRENCY` environment variable for flexible scaling.
- **CI/CD Security Hardening** — Integrated `gitleaks` and strict `SECRETS_PROVIDER` validation in GitHub Actions.
- **MongoDB Optimization** — Audited and optimized compound indexes for performance.
- **Security Hardening** — Enhanced `/api/csp-report` rate-limiting and JSON sanitization.
- **Startup Validation** — Added loud-fail validation for critical environment variables (`TRUST_PROXY`, `REDIS_URL`, etc.).

## Version Unification
- Standardized all version references to `45.0.0` / `HemaV045` across the entire codebase.
- Unified conflicting version indicators and overlapping comments.

# V044 — Enterprise Architecture Upgrade (2026-05-03)

## Breaking Changes
- None (backward-compatible with V043)

## New Features
- **Feature Flags System** — Runtime feature toggles via Redis + env vars + admin API
- **Repository Pattern** — Domain interfaces decouple business logic from MongoDB
- **Caching Layer** — `RedisCache` class with cache-aside pattern, tag invalidation
- **Rate Limiter** — Redis Lua sliding-window with in-memory LRU fallback
- **Audit Logging** — Typed `AuditAction` union, convenience wrappers, `/api/v1/admin/audit-logs` endpoint
- **Audit Logs API** — `GET /api/v1/admin/audit-logs` with filters + pagination
- **Feature Flags API** — `GET/POST /api/v1/admin/feature-flags`

## Architecture
- Added `src/domain/` layer (entities + repository contracts)
- Added `src/infrastructure/` layer (MongoDB adapters + Redis cache)
- Added `src/application/` layer (feature flags, future use-cases)

## CI/CD
- Full multi-environment pipeline: development → staging → production
- Rollback job via `workflow_dispatch`
- Dependency review workflow (blocks high-severity vulns in PRs)
- TruffleHog secret scanning

## Security
- Middleware rewritten: lighter, nonce-based CSP per request
- All dependency versions pinned (no caret ranges)

## Tests
- `test:all` now runs unit + integration + e2e in sequence
- `test:all:ci` for CI with coverage + forceExit
- New: `__tests__/unit/enterprise/enterprise-features.test.ts`

---


## [42.0.0] — 2026-05-02 — HemaV042

### ⚠️ Breaking Changes

- **Bcrypt → Argon2id migration is now enforced at login.**
  Users with old bcrypt password hashes (`$2b$` / `$2a$`) are blocked from logging in
  and redirected to `/forgot-password`. Run `npm run migrate:bcrypt` immediately after
  deploying to generate reset tokens and send reset emails to all affected users.
  There is no backward-compatible fallback — bcrypt is explicitly prohibited.

- **`CSP_REPORT_URI` env var** — the placeholder Sentry value has been removed from
  `.env.example`. Set it to your actual endpoint (see `.env.example` for options).

### Security Fixes

#### [CRIT] Bcrypt → Argon2id migration enforced (AUTH-001)
**Files:** `src/lib/auth.ts`, `src/lib/mongodb.ts`, `src/middleware.ts`,
           `src/app/api/auth/reset-password/route.ts`, `scripts/migrate-bcrypt-to-argon2.ts`

- `authorize()` now explicitly detects bcrypt hashes (`$2b$` / `$2a$` prefix) and
  sets `mustResetPassword=true` on the user before rejecting the login.
- `mustResetPassword` and `mustResetReason` fields added to `UserSchema`.
- Middleware enforces `mustResetPassword`: all authenticated routes redirect to
  `/forgot-password?reason=reset_required`; API routes return 403 `PASSWORD_RESET_REQUIRED`.
- `reset-password` route clears `mustResetPassword` and `mustResetReason` after a
  successful argon2id password is set.
- Migration script (`scripts/migrate-bcrypt-to-argon2.ts`) finds all bcrypt-hashed
  users, flags them, generates 7-day reset tokens, and enqueues reset emails.
  Run once per environment: `npm run migrate:bcrypt` (dry-run: `npm run migrate:bcrypt:dry`).

#### [HIGH] AWS Secrets Manager implementation (FIND-002)
**File:** `src/lib/secrets.ts`

- `_fetchFromAWS()` fully implemented using `@aws-sdk/client-secrets-manager`.
- Secrets stored under path `hema/<SECRET_NAME>` in AWS SM.
- Supports both plain-string and JSON-wrapped (`{ "value": "..." }`) secret formats.
- `ResourceNotFoundException` degrades gracefully to `process.env` fallback.
- All other AWS errors escalate hard in production (fail-closed).
- HashiCorp Vault stub retained for future use — still throws in production if selected.
- Decision rationale documented inline: AWS SM chosen over Vault for zero operational
  overhead, native serverless integration, and ~$8/month cost for ~20 secrets.

#### [HIGH] Secrets rotation webhook (V042-ROT-01)
**File:** `src/app/api/secrets/rotate/route.ts` (new)

- `/api/secrets/rotate` receives AWS SM Lambda rotation callbacks via POST.
- Protected by `ROTATION_WEBHOOK_SECRET` with `crypto.timingSafeEqual` comparison.
- Validates `name` against an allowlist of known `SecretName` values.
- Calls `rotateSecret()` to update the in-memory cache without restart.
- Added to `CSRF_EXEMPT` in middleware (has its own HMAC auth).
- Rate-limited and audit-logged.

#### [MED] CSP_REPORT_URI hardcoded placeholder removed (SEC-ENV-01)
**File:** `.env.example`

- The fake Sentry URL (`https://o123456.ingest.sentry.io/api/123/...`) in `.env.example`
  has been replaced with a blank value and clear multi-option instructions.
- `CSP_REPORT_URI` added to `SecretName` union so it can be rotated via AWS SM
  without redeployment.

#### [MED] security.txt hardened (RFC-9116)
**File:** `public/.well-known/security.txt`

- `Expires` updated to `2027-05-02T00:00:00.000Z` (1 year from release).
- `Hiring` field added per RFC 9116 best practices.
- Contact email confirmed as `security@hemafurniture.com`.

### Added

- `scripts/migrate-bcrypt-to-argon2.ts` — idempotent migration script with dry-run support.
- `src/app/api/secrets/rotate/route.ts` — AWS SM hot-rotation webhook.
- `mustResetPassword` / `mustResetReason` fields on `UserSchema`.
- `ROTATION_WEBHOOK_SECRET`, `SECRETS_PROVIDER`, `AWS_REGION` added to `.env.example`.
- npm scripts: `migrate:bcrypt`, `migrate:bcrypt:dry`.
- `CSP_REPORT_URI` added to the `SecretName` union in `secrets.ts`.

### Changed

- `package.json` version: `40.0.0` → `42.0.0` (skipping 41 to align with release numbering).
- `VERSION` file updated to `42.0.0`.
- `src/lib/secrets.ts`: AWS Secrets Manager fully implemented (was a commented stub).
- `src/lib/auth.ts`: `authorize()` detects bcrypt hashes and rejects with `PASSWORD_RESET_REQUIRED`.
- `src/lib/auth.ts`: JWT type extended with `mustResetPassword?: boolean`.
- `src/middleware.ts`: `CSRF_EXEMPT` extended with `/api/secrets/rotate`.
- `src/middleware.ts`: `mustResetPassword` enforcement block added after MFA check.
- `.env.production.template`: `CSP_REPORT_URI` section added.

### Migration Notes

1. **Deploy V042** to your staging environment first.
2. **Run** `npm run migrate:bcrypt:dry` (dry-run) to see affected users.
3. **Run** `npm run migrate:bcrypt` to flag users and send reset emails.
4. **Install AWS SM SDK** (if activating FIND-002): `npm i @aws-sdk/client-secrets-manager`.
5. **Set** `SECRETS_PROVIDER=aws`, `AWS_REGION`, and `ROTATION_WEBHOOK_SECRET` in production env.
6. **Update** `CSP_REPORT_URI` in your actual `.env` / Vercel project settings.

---


## [V043] — 2026-05-03

### Security Fixes
- **[HIGH-01]** `src/lib/auth.ts` — Fixed user enumeration via timing side-channel.
  Non-existent users now always run `argon2Verify()` against a DUMMY_HASH so response
  time is indistinguishable from a real wrong-password attempt. Replaced the previous
  `setTimeout(200ms)` fallback which was measurably different from argon2's ~150ms cost.
- **[MED-01]** `src/lib/secrets.ts` + `src/lib/env/index.ts` — `REDIS_URL` is now
  **required** in production. Without Redis, rate limiting degrades to per-instance
  in-memory counters which are independent across Vercel instances, allowing N × limit
  brute-force attempts. The env validator now hard-errors on missing `REDIS_URL` in production.
- **[MED-02]** `src/middleware.ts` — CSRF cookie `SameSite` changed from `'strict'` to
  `'lax'`. `SameSite=Strict` broke top-level navigation from external origins (e.g.
  password-reset email links). The actual CSRF protection is the Double Submit HMAC
  pattern, not `SameSite` alone. `'lax'` still blocks cross-site state-mutating requests.
- **[MED-03]** `src/lib/mongodb.ts` — AuditLog TTL default raised from 90 to **365 days**
  for PCI-DSS compliance. Financial events require 12 months of audit log retention.
  Override via `AUDIT_LOG_TTL_SECONDS` env var (minimum 30 days enforced).
- **[LOW-01]** `src/middleware.ts` — CSP `report-uri` now falls back to the built-in
  `/api/csp-report` endpoint when `CSP_REPORT_URI` env var is not set. Previously,
  CSP violations were silently discarded when the env var was absent.
- **[LOW-02]** `src/app/api/paymob/callback/route.ts` — Added Redis idempotency key
  (`paymob:cb:<txId>`) with `SET NX EX` to prevent duplicate processing of Paymob
  webhook retries. Gracefully falls back to the existing DB-level guard if Redis
  is unavailable.
- **[LOW-03]** `src/app/api/v1/upload/route.ts` — Added Sharp metadata check before
  Cloudinary upload. Images exceeding 5000×5000 px are rejected to prevent decompression
  bombs. A compressed 9.9 MB PNG can decompress to 200 MB+ in memory.
- **[LOW-04]** `src/middleware.ts` — Documented why SRI does not apply to Paymob
  (loaded via `<iframe>`, not a `<script>` tag). CSP `frame-src` already restricts
  to `https://accept.paymob.com`.

## [38.0.0] — 2026-05-02 — Full Security Audit Remediation (HemaV038)

### Security Fixes (from SECURITY_AUDIT_HemaV036_to_99.md)
- **[VULN-01 — Docs]** Updated `SECURITY.md` Security Controls table: replaced bcrypt references with argon2id parameters (memoryCost=64MiB, timeCost=3, parallelism=4). Added migration note for legacy hashes.
- **[VULN-02 — Input Validation]** Added `validateObjectId` to all handlers in `orders/[id]/route.ts` (GET, PUT, DELETE). Moved `validateObjectId` to first-check position in `refund/route.ts` and `retry-payment/route.ts` — consistent defense-in-depth across all order routes.
- **[VULN-03 — SSRF Protection]** Added `ALLOWED_IMAGE_DOMAINS` allowlist in `reviews/route.ts`. Review images now restricted to `res.cloudinary.com`, `images.unsplash.com`, `placehold.co` over HTTPS only.
- **[VULN-04 — Config Hygiene]** Removed `SESSION_SECRET=` from `.env.example`. Replaced with explanatory comment clarifying `NEXTAUTH_SECRET` is the only session secret.
- **[VULN-05 — CSP Monitoring]** Extended `buildCSP()` in `middleware.ts` with `report-uri` + `report-to csp-endpoint` directives. Added `Report-To` header in `next.config.js`. Added `CSP_REPORT_URI` to `.env.example`.
- **[VULN-06 — DoS Prevention]** Added `{ rateMax: 60, rateWindow: 60 }` to `GET /api/v1/reviews`. Added `productId` format validation (ObjectId regex) to prevent NoSQL crash vectors on unauthenticated endpoint.
- **[VULN-07 — Responsible Disclosure]** Created `public/.well-known/security.txt` per RFC 9116. Includes contact email, expiry, acknowledgments, preferred languages, canonical URL, and policy link.
- **[VULN-08 — TypeScript]** Removed `@ts-nocheck` from `jest.config.ts`. Fixed `tsTransform` type to `Record<string,[string,object]>` matching ts-jest's tuple format. Updated version comment to v15.0.
- **[VULN-09 — Password Policy]** Added password reuse prevention in `reset-password/route.ts` per NIST SP 800-63B. Returns `400 PASSWORD_REUSE` if new password matches current argon2id hash.
- **[VULN-10 — DoS Prevention]** Added `MAX_BODY_SIZE = 1MB` guard in `validateBody()` in `api.ts`. Two-stage check: Content-Length header (fast path) + JSON.stringify size (double-check after parsing).
- **[VULN-11 — Test Coverage]** Created `__tests__/unit/security/mfa-token.test.ts` with 11 tests covering: basic happy-path, cross-user token substitution attack, tampered userId/expiresAt/signature, and expiry enforcement.

### Version Unification
- `VERSION`: 37.0.0 → **38.0.0**
- `package.json` version: 37.0.0 → **38.0.0**

### Notes for Ops
1. Set `CSP_REPORT_URI` in production secrets to enable real-time XSS violation monitoring.
2. Update `security@hemafurniture.com` contact and policy URLs in `public/.well-known/security.txt` before go-live.
3. No breaking changes — all fixes are additive or configuration-level.

---

## [37.0.0] — 2026-05-02 — Security Audit Fixes Applied (HemaV037)

### Security Fixes
- All 11 vulnerabilities from `SECURITY_AUDIT_HemaV036_to_99.md` applied.
- See `FIXES_HemaV037.md` for full per-vulnerability details.

### Version Unification
- `VERSION`: 36.0.0 → 37.0.0
- `package.json` version: 35.0.0 → 37.0.0

---

## [36.0.0] — 2026-05-01 — Quality & Security Hardening (HemaV036)

### Breaking Changes
- **next-auth v4 → Auth.js v5** — `authOptions` replaced by `NextAuthConfig`; `getServerSession` replaced by `auth()`; cookie names preserved for session continuity.
- **bcrypt → argon2id** — `@node-rs/bcrypt` removed; `@node-rs/argon2` added. Existing bcrypt hashes will fail verify — users must reset passwords via `/forgot-password` after upgrade.

### Architecture
- **[ADMIN_ROLES — Single Source of Truth]** Moved `ADMIN_ROLES` constant to `src/lib/constants.ts`. Removed 3 duplicate local definitions from `middleware.ts`, `auth.ts`, `admin/layout.tsx`. Closes the divergence risk that caused the V009 bug.

### Security
- **[next-auth v5]** Eliminated EOL risk from next-auth v4. Auth.js v5 is actively maintained with security patches.
- **[argon2id]** Replaced bcrypt (cost 12, ~250ms, CPU-only) with argon2id (64MiB, t=3, p=4, GPU-resistant). Prevents offline dictionary attacks with modern GPU rigs.
- **[CORS PATCH]** Added PATCH to `Access-Control-Allow-Methods` in `next.config.js`. Several endpoints (users, orders, reviews) use PATCH and were silently rejected by strict CORS preflight clients.

### Code Quality
- **[TypeScript __tests__]** Removed `__tests__` from `tsconfig.json` exclude — TypeScript errors in test files are now caught by `npm run typecheck`.
- **[authz.ts as any]** Replaced `as any` cast in `emitDenialAlert` with a typed sentinel cast — type safety maintained without losing functionality.

### CI/CD
- **[Coverage Enforcement]** CI test job now passes `--coverage` flag with explicit threshold args — a zero-coverage build can no longer pass CI silently.

### Notes for Ops
1. After deployment, force all users to reset passwords (argon2id migration) OR add bcrypt fallback detect/rehash in `auth.ts` authorize for seamless migration.
2. Delete `SESSION_SECRET` from GitHub Secrets if not done after V033.
3. `NEXTAUTH_URL` must be set in production env (enforced since V035).

---

 — 2026-05-01 — Pending Security Fixes (HemaV035)

### Medium Severity Fixes
- **[MED-02]** `mongodb.ts` + `mfa/verify/route.ts`: Added dedicated `mfaFailedAttempts` field to `UserSchema`. The MFA verify handler now tracks TOTP/backup failures in this separate counter instead of the shared `failedLogins` field — prevents DoS lockout cross-contamination between password and MFA attack surfaces, and enables independent lock-out policies for each authentication factor.
- **[MED-03]** `.gitignore`: Added `vercel.json` to the ignore list — prevents accidental exposure of internal API function paths, cron endpoint paths, and max-duration configurations in the public repository.
- **[MED-06]** `secrets.ts`: Added `module.hot.dispose` hook (dev-only, `NODE_ENV === 'development'`) that calls `clearSecretCache()` on Next.js hot reload — stale secrets can no longer survive a module replacement during development.

---

## [33.0.0] — 2026-05-01 — Security Audit Full Remediation (Hema033)

### Critical Fixes
- **[CRIT-01 + HIGH-04]** `login/page.tsx`: Rewrote `getSafeCallbackUrl` to decode percent-encoding before validation, block Unicode slash variants (U+2215, U+29F5, etc.), and use `URL` constructor to catch any origin shift — closes Open Redirect via `/%2Fevil.com` and Unicode slash bypasses.

### High Severity Fixes
- **[HIGH-01]** Added `validateObjectId(params.id)` call (early-return guard) in all five `[id]` routes that were missing it: `admin/reviews/[id]`, `orders/[id]/refund`, `orders/[id]/retry-payment`, `users/[id]` (GET/PUT/PATCH/DELETE), `users/[id]/role`.
- **[HIGH-02]** `env/index.ts`: Added `superRefine` check that fails validation in production when `NEXTAUTH_URL` is absent — prevents Host Header Injection on auth emails.
- **[HIGH-03 + LOW-03]** `.github/workflows/ci.yml`: Removed `SESSION_SECRET` from all three jobs (test, build, e2e) — the variable is unused in the codebase and every extra CI secret increases blast radius.
- **[HIGH-05]** `orders/[id]/refund/route.ts`: Added `order.total <= 0` guard before the Paymob call — zero-value orders (100% coupon) are now rejected with a clear 400 before reaching the payment gateway.

### Medium Severity Fixes
- **[MED-01]** `orders/track/route.ts`: Replaced case-insensitive `$regex` with exact lowercase match for `guestEmail` — MongoDB can now use the index, eliminating the full collection scan DoS vector on this unauthenticated endpoint.
- **[MED-04]** `mongodb.ts`: Added minimum 30-day floor for `AUDIT_LOG_TTL_SECONDS` — setting the variable to 1 second no longer allows an insider to erase the entire audit trail.
- **[MED-05]** `docker-compose.yml` + `docker/redis.conf`: Redis password is now injected via a config file template rather than a `--requirepass` CLI argument — closes the `ps aux` / `/proc/[pid]/cmdline` exposure.

### Low Severity Fixes
- **[LOW-01]** `middleware.ts` + `vercel.json`: Removed deprecated `X-XSS-Protection: 1; mode=block` header — the nonce-based CSP already provides superior XSS protection.
- **[LOW-02]** `vercel.json`: Added `interest-cohort=()` to `Permissions-Policy` — now matches `middleware.ts` exactly, eliminating the policy inconsistency between Vercel Edge and application middleware.

---

## [31.0.0] — 2026-05-01 — Security Hardening (HemaV031)

### Critical Security Fixes

- Fix #1 — Open Redirect via unvalidated orderId in Paymob GET callback (api/paymob/callback/route.ts)
  The GET redirect handler embedded the raw `order` query parameter in the redirect URL without
  sanitization. Attackers could inject path-traversal or special chars causing header injection.
  Fix: strip non-digits from orderId before any use; never echo raw input in redirects;
  success path uses encodeURIComponent(order.orderNumber) from trusted DB source.

- Fix #2 — Timing oracle on CRON_SECRET via non-constant-time comparison (api/cron/cleanup/route.ts)
  auth === `Bearer ${secret}` short-circuits on first differing byte, leaking timing info
  that can recover the secret character-by-character. Fix: crypto.timingSafeEqual on 512-byte
  fixed-length buffers so comparison time is constant regardless of mismatch position.

- Fix #3 — Same timing oracle on METRICS_SECRET (api/metrics/route.ts)
  Identical issue to Fix #2. Fix: timingSafeCompare() helper using crypto.timingSafeEqual.

### High-Risk Fixes

- Fix #4 — crypto.timingSafeEqual on unequal-length buffers (lib/mfa-token.ts)
  When received HMAC sig and computed expected differ in length, timingSafeEqual throws
  RangeError. Outer try/catch silently returned null — correct but fragile.
  Fix: explicit length check early-return before calling timingSafeEqual.

- Fix #5 — SSRF via *.cloudfront.net wildcard in Next.js image remote patterns (next.config.js)
  Any attacker-controlled CloudFront distribution could be proxied through Next.js image
  optimizer, enabling SSRF to internal AWS metadata endpoints (IMDSv1 etc.).
  Fix: removed wildcard; specific hostnames must be added explicitly.

- Fix #6 — X-DNS-Prefetch-Control: on leaks dependency topology; CORS allows unused methods
  (a) DNS prefetch leaks external dependency hostnames. Changed to off.
  (b) CORS allowed PATCH (unused) and OPTIONS (browser-managed). Narrowed to GET,POST,PUT,DELETE.

- Fix #7 — SVG and MathML not blocked in sanitizeRich (lib/sanitize.ts)
  <svg onload="xss()"> and <math href="javascript:..."> bypassed stripDangerousBlocks.
  SVG/MathML open new browser parsing contexts that evade HTML-level attribute restrictions.
  Fix: explicit regex strips for full SVG/MathML blocks and self-closing forms.

- Fix #8 — In-memory rate limit fixed-window allows 2x burst (lib/redis.ts)
  Fixed-window counter reset to 1 at boundary, allowing burst of 2xmax requests.
  Fix: sliding-window carry-over — new window inherits weighted portion of previous count.

- Fix #9 — Non-admin can assign admin role if change:role is ever granted (lib/authz.ts)
  assertCanAssignRole only checked change:role permission, not the target role value.
  Fix: hard guard — only actors with role=admin may assign newRole=admin.

- Fix #10 — Weak minimum lengths for PAYMOB_HMAC_SECRET and METRICS_SECRET (lib/env/index.ts)
  Both required only 16 chars, below NIST SP 800-107 recommendation of 32 bytes for HMAC keys.
  Fix: raised both minimums to 32 characters to match NEXTAUTH_SECRET and CRON_SECRET.

### Version Unification
  All 55 source files, VERSION, package.json, docker-compose.yml, Dockerfile,
  next.config.js, eslint.config.js, and sentry configs now consistently use V031 / 31.0.0.

---

## [30.0.0] — 2026-05-01 — Security Hardening (HemaV030)

### 🔴 Critical Security Fixes

- **Fix #1 — `unsafe-eval` in development CSP** (`middleware.ts`)
  Development CSP included `'unsafe-eval'` in the `script-src` directive, weakening XSS
  protection during development and potentially leaking into staging environments.
  Fix: removed `'unsafe-eval'` entirely — `'strict-dynamic'` with nonce is sufficient.

- **Fix #2 — Missing MongoDB ObjectId validation on `[id]` routes** (`api.ts`, admin routes)
  `params.id` was passed directly to `findById()` without format checking. Malformed IDs
  (e.g., `../admin`, `__proto__`) caused unhandled Mongoose `CastError` instead of a
  clean 400 response, leaking stack traces in some configurations.
  Fix: added `validateObjectId()` / `isValidObjectId()` helpers to `api.ts` and applied
  them at the top of every parameterized admin route before any DB call.

- **Fix #3 — HTML pages missing global security headers** (`next.config.js`)
  `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `X-DNS-Prefetch-Control`, and `Strict-Transport-Security` were only set for `/api/*`
  routes. All page routes were missing them, leaving the UI vulnerable to clickjacking
  and MIME-sniffing attacks.
  Fix: added a `source: '/(.*)'` header block that applies these headers universally.

- **Fix #4 — IP spoofing via X-Forwarded-For when trust-proxy is off** (`lib/ip.ts`)
  When `TRUST_PROXY` was not set and the app was not on Vercel/CF, `getClientIp()`
  still read `X-Forwarded-For` as a fallback. Any client could set this header and
  bypass IP-based rate limiting by claiming to be a different (or whitelisted) IP.
  Fix: rewritten `getClientIp()` to only read forwarding headers when `trustProxy()`
  returns true; otherwise falls back exclusively to `req.ip` (the socket address).

### 🟠 High-Risk Fixes

- **Fix #5 — XSS via event handlers on allowed rich-text tags** (`lib/sanitize.ts`)
  `sanitizeRich()` stripped dangerous block elements but did not remove `on*` event
  handler attributes or `style` attributes from allowed tags. An attacker could submit
  `<b onmouseover="fetch(...)">` or `<p style="background:url(javascript:...)">`.
  Fix: added `stripEventHandlersAndStyle()` pass before the tag-name allow-list check.

- **Fix #6 — CSRF exempt list too broad for `/api/auth`** (`middleware.ts`)
  `CSRF_EXEMPT` included the prefix `/api/auth`, exempting ALL auth routes including
  `/api/auth/change-password` from CSRF validation. A CSRF attack could change any
  authenticated user's password from a malicious third-party site.
  Fix: replaced the broad prefix with an explicit allowlist of only the NextAuth.js
  internal endpoints that legitimately cannot carry CSRF tokens.

- **Fix #7 — TOTP token accepts non-numeric input** (`api/auth/mfa/setup/route.ts`)
  The `VerifySchema` for MFA setup only validated `z.string().length(6)` — it accepted
  any 6-character string. Non-numeric tokens always fail `authenticator.verify()` but
  could be used in timing-oracle attacks or fuzzing.
  Fix: added `.regex(/^[0-9]{6}$/)` to enforce numeric-only TOTP tokens.

- **Fix #8 — healthz endpoint trusted X-Forwarded-For for loopback check** (`api/healthz/route.ts`)
  `isPrivilegedHealthCaller()` read `x-forwarded-for` directly to check for `127.0.0.1`.
  Any external attacker could send `X-Forwarded-For: 127.0.0.1` and receive verbose
  health data (version, uptime, latency breakdowns) without a secret token.
  Fix: replaced the raw header read with `getClientIp(req)` which applies trust-proxy rules.

- **Fix #9 — Missing production-startup enforcement for CRON_SECRET / METRICS_SECRET** (`lib/env/index.ts`)
  Both secrets were `z.optional()` with no production warning. Without `CRON_SECRET`,
  the cron cleanup route runs unauthenticated. Without `METRICS_SECRET`, Prometheus
  metrics (version, memory, circuit state) are world-readable.
  Fix: added `ctx.addIssue()` warnings that fail startup in production when either
  secret is absent, matching the existing `REDIS_URL` warning pattern.

### 🔧 Version Unification

  All source file headers, `VERSION`, `package.json`, `docker-compose.yml`,
  `Dockerfile`, and `next.config.js` now consistently reference **V030** / **30.0.0**.

---

# Changelog

All notable changes to **Hema Furniture** are documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [27.0.0] — 2026-04-30 — Critical Bug Fixes & High-Risk Remediation

### 🔴 Critical Fixes

- **Critical #1 — authSession declared before coupon block** (`order.service.ts`)
  `authSession` was used at line ~117 (per-user coupon limit check) but declared
  at line ~174. This made `currentUserId` always `undefined`, rendering the
  per-user coupon limit completely non-functional — any user could reuse a coupon
  indefinitely. Fix: moved `const authSession = await getAuthSession()` to the
  top of the try-block, before any coupon logic. Removed the duplicate declaration.

- **Critical #2 — `collision` variable referenced but never declared** (`products/route.ts`)
  The slug-retry loop used `attempt > 0 || collision` where `collision` was never
  declared in scope. This produced `undefined` (falsy) in normal JS, meaning the
  suffix was only applied when `attempt > 0` — but the comment and intent required
  it on any duplicate-key error. In strict mode it would throw `ReferenceError`.
  Fix: introduced `let hadCollision = false;` before the loop, set to `true`
  in the catch block when a MongoDB 11000 error occurs.

- **Critical #3 — No idempotency key sent from CheckoutPage** (`CheckoutPage.tsx`)
  The server supports `Idempotency-Key` header but the frontend never sent it.
  A network failure mid-request followed by a retry would create two orders and
  charge the customer twice. Fix: added `const idempotencyKeyRef = useRef(crypto.randomUUID())`
  — stable across re-renders — and passes `'Idempotency-Key': idempotencyKeyRef.current`
  in the order POST request headers.

### 🟠 High-Risk Fixes

- **High #1 — Reviews auto-published without moderation** (`reviews/route.ts`)
  All new reviews were created with `isApproved: true`, bypassing the admin
  moderation panel added in V025. Fix: changed to `isApproved: false` so every
  new review enters the moderation queue at `/admin/reviews` before going live.

- **High #2 — Unsplash default product image** (`products/route.ts`, `public/images/`)
  Default product image pointed to an Unsplash direct-link URL which can break
  without notice and may violate Unsplash ToS for production commercial use.
  Fix: replaced with `/images/product-placeholder.svg` served from the app's
  own `public/` directory. Added the SVG file to `public/images/`.

- **High #3 — /wishlist route not in PROTECTED_PATHS** (`middleware.ts`)
  Unauthenticated users could access `/wishlist` — server sync would silently fail
  and they'd see a confusing empty list. Fix: added `'/wishlist'` to
  `PROTECTED_PATHS`; unauthenticated visitors are redirected to `/login`.

- **High #4 — Email worker deployment undocumented** (`README.md`)
  README recommended Vercel without warning that the BullMQ email worker is a
  long-running process incompatible with Vercel Serverless. Fix: added a prominent
  warning and step-by-step deployment instructions for Railway, Fly.io, and Docker.

- **High #5 — Zero test coverage for V025/V027 features**
  New wishlist page, newsletter API, admin reviews, and WishlistStore had 0 tests.
  Added: `__tests__/unit/v023-critical-fixes.test.ts` (structural regression guards
  for all 3 critical bugs), `__tests__/unit/wishlistStore.test.ts` (6 unit tests),
  `__tests__/integration/api/newsletter.test.ts` (5 integration tests),
  `__tests__/integration/api/adminReviews.test.ts` (2 auth-guard tests).

### 🔧 Version Unification

  All 72 source file header comments, `VERSION`, `package.json`,
  `docker-compose.yml`, `Dockerfile`, and `CHANGELOG.md` now consistently
  reference **V027** / **27.0.0**.

---

## [27.0.0] — 2026-04-30 — Production Readiness & Feature Completeness

### 🔴 Critical Fixes

- **FIX #1 — Wishlist page created**
  `/wishlist` page was missing entirely — the Navbar directed users to a 404.
  Added `src/app/wishlist/page.tsx` and `src/components/wishlist/WishlistPage.tsx`
  with full product grid, add-to-cart, remove, and server-sync for logged-in users.

- **FIX #2 — Newsletter subscription is now real**
  The subscribe button previously called `toast.success()` only — no data was saved.
  Added `POST /api/v1/newsletter` and `DELETE /api/v1/newsletter` API routes backed
  by the `NewsletterSubscriber` MongoDB collection. HomePage now calls the real API
  with loading/done states. Rate-limited at 5 req/min per IP.

- **FIX #3 — All 19 `@ts-nocheck` directives removed**
  Every sensitive file (mongodb.ts, order.service.ts, paymob callback, authz.ts,
  redis.ts, queue.ts, all admin pages, store pages) now has full TypeScript coverage.
  Type errors in financial paths are no longer silently suppressed.

- **FIX #4 — Admin Review Management panel added**
  No UI existed to approve, hide, or delete user reviews.
  Added `/admin/reviews` page with approve/hide/delete actions, filter tabs
  (all / pending / approved), and paginated listing with product names.
  Added `GET /api/v1/admin/reviews` and `PATCH /api/v1/admin/reviews/[id]` endpoints.

### 🟠 High Priority Fixes

- **FIX #5 — Docker ports bound to localhost**
  `docker-compose.yml` previously exposed MongoDB (27017) and Redis (6379) on all
  network interfaces. Changed to `127.0.0.1:27017:27017` and `127.0.0.1:6379:6379`
  so only the host machine can reach these services directly.

- **FIX #6 — Wishlist synced to server for logged-in users**
  `useWishlistStore` gained `setIds()` and `setSynced()` actions. `WishlistPage`
  fetches `/api/v1/users/wishlist/sync` on mount and merges server IDs into local
  state, so wishlist survives browser/device changes for authenticated users.

- **FIX #7 — Admin layout covers manager role**
  `AdminLayout` role check was `admin | staff` — managers were silently redirected.
  Updated to use the same `ADMIN_ROLES = Set(['admin','manager','staff'])` constant
  already used in middleware and auth.ts.

- **FIX #8 — Admin nav includes Reviews link**
  `AdminLayout` NAV array now includes `{ href: '/admin/reviews', icon: '⭐', label: 'Reviews' }`.

### 🟡 Housekeeping

- **Version unified**: all source-file header comments, `package.json`, `VERSION`,
  `docker-compose.yml` now consistently reference **V025**.

- **NewsletterSubscriber model** added to central `src/lib/mongodb.ts` exports
  (with `email` unique index and `isActive` index) so it's available to any future
  admin newsletter management pages.

---



### 🔴 Critical Fixes

- **FIX #1 — MFA server-side completion token (closes V015 acknowledged bypass)**
  Replaced client-driven `session.update({ mfaVerified: true })` trust with a
  short-lived (90s) HMAC-SHA256 signed completion token issued by
  `/api/auth/mfa/verify`. The JWT callback (`auth.ts`) now validates this token
  before clearing `mfaPending`. A client that never passed real TOTP verification
  cannot produce a valid token. New module: `src/lib/mfa-token.ts`.

- **FIX #2 — MongoDB authentication in Docker**
  `docker-compose.yml` now requires `MONGO_ROOT_USER`, `MONGO_ROOT_PASS`,
  `MONGO_APP_USER`, and `MONGO_APP_PASS` env vars. A new `docker/mongo-init.js`
  init script creates a scoped app user with `readWrite` on the `hema` database
  only. The app and worker `MONGODB_URI` now include credentials.
  Previously MongoDB ran with no authentication — any container on the Docker
  network could connect without a password.

### 🟠 High Priority Fixes

- **FIX #3 — Per-user coupon tracking**
  `CouponSchema` gains `perUserLimit` (default: 1) and `usedBy` (array of
  ObjectIds). `order.service.ts` enforces per-user limits with an atomic MongoDB
  update that includes both a global `$expr` guard and a per-user `$filter` guard.
  Previously one user could redeem the same coupon up to `maxUses` times.

- **FIX #4 — Redis cache for permission-version check**
  Middleware now caches `permissionVersion` in Redis with a 30-second TTL.
  Previously every authenticated request triggered a MongoDB query to check `pv`.
  Cache is keyed by `pv:{userId}` and falls back to DB on miss or Redis outage.

- **FIX #5 — Fawry / ValU return 501 instead of silent COD fallback**
  `order.service.ts` throws `{ status: 501 }` when `paymentMethod` is `fawry`
  or `valu`. Previously the order was silently created as COD with no user notice.

- **FIX #6 — Guest order tracking endpoint**
  New `POST /api/v1/orders/track` requires both `orderNumber` and `email`.
  Rate-limited (10 req / 10 min per IP). Returns identical 404 for not-found
  and email mismatch to prevent order-number enumeration. Auth-user orders are
  excluded (`userId: { $exists: false }`).

### 🟡 Medium Priority Fixes

- **FIX #7 — Metrics endpoint always requires bearer in production**
  `isAuthorized()` no longer bypasses `METRICS_SECRET` for localhost IPs in
  production. In cloud environments (Kubernetes, ECS) all pods appear as local
  addresses — the previous bypass exposed metrics to any internal service.

- **FIX #8 — Deduplicated IP resolution**
  Removed `getClientIp()` and `isRunningBehindTrustedProxy()` from
  `middleware.ts`. Both were partial duplicates of `getIP()` in `api.ts` with
  different header-priority ordering. Middleware now imports `getIP()` directly.

- **FIX #9 — `category.sub` enum validation**
  Product sub-category now validated against a fixed enum (44 values across 5
  main categories). Previously any string was accepted, leading to inconsistent
  data (`"Sofas"` vs `"sofas"` vs `"sofa"`).

- **FIX #10 — `relatedProducts` capped at 20**
  Mongoose array validator added: `relatedProducts` throws if more than 20 items
  are pushed. Previously unbounded — theoretically thousands of IDs per product.

- **FIX #11 — `jsdom` removed from production dependencies**
  Replaced `dompurify` + `jsdom` with `isomorphic-dompurify` in both
  `sanitize.ts` and `email.ts`. `isomorphic-dompurify` uses a minimal DOM shim
  on the server and the native DOM on the client — no heavyweight test library in
  production bundles. No API changes; all call-sites unchanged.

- **FIX #12 — Slug collision uses `crypto.randomBytes` instead of `Date.now()`**
  Concurrent admin POSTs for the same product name in the same millisecond could
  still collide with `Date.now()`. `crypto.randomBytes(4).toString('hex')` gives
  2³² possible suffixes — collision probability negligible.

- **FIX #13 — `SLACK_WEBHOOK_URL` routed through secrets adapter**
  `queue.ts` now reads the Slack webhook via `getSecret('SLACK_WEBHOOK_URL')`
  instead of `process.env.SLACK_WEBHOOK_URL` directly, enabling secret rotation
  and consistent auditability.

- **FIX #14 — Redis password enabled in Docker**
  `docker-compose.yml` redis service now uses `--requirepass ${REDIS_PASSWORD}`.
  Previously Redis was unauthenticated on the Docker network.

- **FIX #15 — Docker runs production build**
  `app` and `worker` services now use a multi-stage `Dockerfile` (`target: runner`
  / `target: worker`). `npm install` runs at image build time only, not on every
  container start. `npm run dev` replaced with `npm run start`.

### 🧪 Testing

- **NEW — `__tests__/unit/mfa-token.test.ts`**
  13 unit tests covering: token issuance, validation, expiry, tamper detection
  (signature and userId), and base64url format.

- **NEW — `__tests__/unit/user.service.test.ts`**
  12 unit tests covering: `getUserById`, `updateUser`, `requestPasswordReset`,
  `resetPassword`, and `toggleWishlist` (add/remove/multiple products/404).

- **EXPANDED — `__tests__/e2e/admin.spec.ts`**
  Grew from 7 access-control checks to 20 tests covering: all admin pages,
  full API security (products, orders, users, coupons, upload, analytics),
  metrics bearer enforcement, guest tracking endpoint, MFA protection,
  and unsupported payment method handling.

- **NEW — `__tests__/integration/api/wishlist.test.ts`**
  8 integration tests covering: toggle add/remove, multi-product independence,
  404 on unknown user, and guest→auth sync merge deduplication.

---

## [15.0.0] — 2026-04-25 — Security Hardening Release

### 🔴 Critical Fixes

- **FIX #1 — Hardcoded Secrets Removed**
  `NEXTAUTH_SECRET` and `SESSION_SECRET` placeholders in `.env.example` replaced with
  empty values + generation instructions. `env/index.ts` now maintains a blocklist of
  known-insecure placeholder values and calls `process.exit(1)` in production if any
  secret matches — the server physically cannot start with a weak secret.

- **FIX #2 — CSP nonce exposed to layout**
  `middleware.ts` now sets `X-CSP-Nonce` response header so `app/layout.tsx` can read
  the per-request nonce and inject it into `<Script>` tags. Removes the last gap between
  nonce generation and nonce consumption. No `unsafe-inline` in production.

- **FIX #3 — Rate limiting verified fail-closed on all auth routes**
  All auth routes (`/api/auth/*`, `/api/auth/mfa/*`) confirmed to use `failClosed: true`.
  Reviewed and validated that `redis.ts` correctly blocks — not allows — when Redis is
  unavailable on fail-closed routes.

- **FIX #4 — Atomic order number generation confirmed**
  `nextSeq()` in `mongodb.ts` uses `findByIdAndUpdate` + `$inc` (single atomic MongoDB
  operation). `countDocuments()` approach fully absent. Format: `HEM-{YEAR}-{00001}`.

- **FIX #10 — MongoDB URI credentials enforced in production**
  `env/index.ts` now validates that `MONGODB_URI` matches `mongodb(+srv)://user:pass@host`
  regex in production. Process exits with clear error if the URI is unauthenticated.
  `.env.example` updated to show correct authenticated URI examples.

### 🟠 High Priority Fixes

- **FIX #7 — IP spoofing prevention**
  `middleware.ts` now includes `getClientIp()` which only trusts `X-Forwarded-For` when
  running behind Vercel (`x-vercel-id`), Cloudflare (`cf-ray`), or explicit
  `TRUST_PROXY=true`. Verified IP is forwarded to API routes via `x-client-ip` header.
  `api.ts` `getIP()` already had correct logic — confirmed and preserved.

- **FIX #8 — Email retry upgraded: 3 → 5 attempts + Slack DLQ alert**
  `queue.ts` now retries up to 5 times with exponential backoff (5s→10s→20s→40s→80s).
  Auth emails (`passwordReset`, `verification`) enqueued at priority 1.
  Permanent failures post a Slack alert with job ID, recipient, attempt count, and error.

- **FIX #9 — Branch protection + CI pipeline**
  `.github/workflows/ci.yml` updated with full 6-stage pipeline: lint → typecheck →
  test (with Redis service) → build → npm audit → E2E (on PRs to main).
  `scripts/protect-branches.sh` added to configure GitHub branch protection via `gh` CLI.

### 🟡 Medium Priority Fixes

- **FIX #11 — Scattered AUDIT files consolidated**
  Removed 9 `AUDIT_*.md` files. Security posture documented in `SECURITY.md`.
  History consolidated into this `CHANGELOG.md`.

- **FIX #12 — Build artifacts excluded from Git**
  `tsconfig.tsbuildinfo` and `*.tsbuildinfo` added to `.gitignore`.

- **FIX #13 — Slack webhook marked confidential**
  `.env.example` comment updated: URL is confidential, rotatable in Slack app settings,
  never logged or sent to the client.

- **FIX #14 — CHANGELOG consolidated**
  Removed 10 `CHANGES_v*.md` files + `CHANGELOG_V009.md`. Single `CHANGELOG.md`
  following Semantic Versioning from this version forward.

### ⚪ Minor Fixes

- **FIX #15 — README CI badge corrected**
  Badge now points to the actual repository workflow URL.

- **FIX #16 — Dependabot enabled**
  `.github/dependabot.yml` added for weekly npm + Actions updates.

- **FIX #17 — PR template added**
  `.github/PULL_REQUEST_TEMPLATE.md` enforces security checklist on every PR.

---

## [14.0.0] — 2026-01-10

### Added
- Permission Version (`pv`) JWT field — middleware invalidates stale tokens immediately
  when a user's role changes, without waiting for JWT expiry.
- `AuditLog` TTL index (90 days) — prevents unbounded growth under brute-force attacks.
- Idempotency key on email queue jobs — double-submission is a no-op.
- Dead-letter queue (`email-dead`) for inspecting permanently failed email jobs.
- Admin coupons management API (`/api/v1/admin/coupons`).

### Fixed
- MFA bypass: `MFA_ALLOWED` list tightened — only TOTP verify + signout allowed while
  `mfaPending=true`. Previously `change-password` was reachable, allowing full MFA bypass.

---

## [13.0.0] — 2025-11-01

### Added
- Circuit breakers (Paymob, Cloudinary, Email) via custom `withCircuitBreaker`.
- Structured logging with correlation IDs via `AsyncLocalStorage`.
- Axiom + BetterStack log shipping.
- IPv6 /64 bucketing in rate limiter to prevent address-rotation bypass.
- In-memory store hard cap (10,000 keys) to prevent OOM under Redis outage.
- `QueueEvents` DLQ wiring for email failures.

### Fixed
- Paymob HMAC secret required in production (was optional, silently breaking all webhooks).
- Redis absence now emits startup warning in production.

---

## [11.0.0] — 2025-09-15 — Major Refactor

### Changed
- Full service layer extraction: `order.service.ts`, `product.service.ts`, `user.service.ts`.
- `api.ts` DI container: typed `AppError` hierarchy replaces string-based throws.
- All API routes migrated to `withHandler()` pattern.

### Fixed
- Race-safe coupon redemption via atomic `$inc` with pre-condition.
- Stock decrement uses conditional update (prevents negative stock under concurrency).
- CSRF exempt list covers both `/api/` and `/api/v1/` Paymob callbacks.

---

## [10.0.0] — 2025-08-01

### Added
- Secrets rotation adapter (`secrets.ts`) — reads from env with version-aware fallback.
- MongoDB connection uses structured logger (not `console.log`).
- `/api/healthz` enhanced: circuit status, Redis, MongoDB health.
- BullMQ email queue with retry (3 attempts). Worker: `emailWorker.ts`.

### Fixed
- Financial precision: subtotal accumulated in integer piastres (avoids IEEE-754 drift).
- `pv` check in middleware skips gracefully when DB is unreachable.

---

## [9.0.0] — 2025-06-15

### Added
- MFA backup codes individually bcrypt-hashed (previously SHA-256).
- ACID transactions for order creation.
- Redis sliding-window rate limiter (replaces fixed-window).
- `failClosed` parameter on `rateLimit()`.

### Fixed
- Coupon race condition: `findOneAndUpdate` with `$inc` + pre-conditions.
- Zero-amount Paymob guard: 100% coupon orders converted to COD.

---

## [7.0.0] — 2025-04-01

### Added
- Manager role added with staff-level permissions.
- `ADMIN_ROLES` constant in middleware — single source of truth for role checks.
- Nonce-based CSP: `unsafe-inline` removed from production `style-src`.

---

## [3.0.0] — 2024-09-01 — Initial Release

### Added
- Next.js 15 App Router architecture.
- MongoDB + Redis integration.
- Paymob payment gateway (Egypt).
- NextAuth JWT sessions in HttpOnly cookies.
- RBAC: admin / manager / staff / customer.
- Zod validation on all API inputs.
- Cloudinary image uploads.
- Zustand cart store.
- MFA via TOTP + backup codes.
- Admin panel: products, orders, users, coupons.
- Docker multi-stage build with non-root user.

---

[42.0.0]: https://github.com/hema01973/hema-furniture/compare/v40.0.0...v42.0.0
[15.0.0]: https://github.com/hema01973/hema-furniture/compare/v14.0.0...v15.0.0
[14.0.0]: https://github.com/hema01973/hema-furniture/compare/v13.0.0...v14.0.0
[13.0.0]: https://github.com/hema01973/hema-furniture/compare/v11.0.0...v13.0.0
[11.0.0]: https://github.com/hema01973/hema-furniture/compare/v10.0.0...v11.0.0
[10.0.0]: https://github.com/hema01973/hema-furniture/compare/v9.0.0...v10.0.0
[9.0.0]:  https://github.com/hema01973/hema-furniture/compare/v7.0.0...v9.0.0
[7.0.0]:  https://github.com/hema01973/hema-furniture/compare/v3.0.0...v7.0.0
[3.0.0]:  https://github.com/hema01973/hema-furniture/releases/tag/v3.0.0
