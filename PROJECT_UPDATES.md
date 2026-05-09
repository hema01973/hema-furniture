# HemaV042 — Project Updates & Security Hardening Report

> **Release:** HemaV042 · **Date:** 2026-05-02 · **Previous:** HemaV041

---

## V043 — 2026-05-03 — Security Audit Remediation

All 8 findings from the V042 security audit have been addressed:

| ID | Severity | Status |
|----|----------|--------|
| HIGH-01 | High | ✅ Fixed — Dummy argon2 hash prevents user enumeration |
| MED-01 | Medium | ✅ Fixed — REDIS_URL required in production |
| MED-02 | Medium | ✅ Fixed — CSRF cookie SameSite=Lax |
| MED-03 | Medium | ✅ Fixed — AuditLog TTL raised to 365 days |
| LOW-01 | Low | ✅ Fixed — CSP violations always reported |
| LOW-02 | Low | ✅ Fixed — Paymob webhook Redis idempotency key |
| LOW-03 | Low | ✅ Fixed — Sharp dimension check before upload |
| LOW-04 | Low | ✅ Documented — SRI N/A for iframe integration |

## Executive Summary

V042 closes the remaining open findings from the V041 security audit cycle, implements
the chosen secrets-management solution (AWS Secrets Manager), and enforces the bcrypt →
argon2id authentication migration with zero backward-compatibility for weak hashes.
This release is **production-ready** and recommended for immediate deployment.

---

## 1 — Security Configuration Fixes

### 1.1  CSP_REPORT_URI — Hardcoded Placeholder Removed

| Field       | Detail |
|-------------|--------|
| **File**    | `.env.example` |
| **Risk**    | Developers copying `.env.example` verbatim would send all CSP violation reports to a non-existent Sentry project, silently swallowing every XSS attempt. |
| **Fix**     | The fake Sentry URL has been removed. The variable is now blank with multi-line comments listing all valid provider options (self-hosted `/api/csp-report`, Sentry, report-uri.com). |
| **Action**  | Set `CSP_REPORT_URI` to your real endpoint in Vercel / your deployment secrets. |

`CSP_REPORT_URI` has also been added to the `SecretName` union in `secrets.ts` so it
can be rotated via AWS Secrets Manager without a redeployment.

### 1.2  security.txt — RFC 9116 Compliance

| Field       | Detail |
|-------------|--------|
| **File**    | `public/.well-known/security.txt` |
| **Standard**| RFC 9116 (Security.txt) |
| **Changes** | `Contact:` confirmed as `security@hemafurniture.com`; `Expires:` updated to `2027-05-02`; `Hiring:` field added (optional but recommended). |
| **Verified**| All mandatory fields present: `Contact`, `Expires`. Optional fields: `Acknowledgments`, `Preferred-Languages`, `Canonical`, `Policy`, `Hiring`. |

---

## 2 — Secrets Management Decision (FIND-002)

### Decision: AWS Secrets Manager

After evaluating both options against the current stack and team size:

| Criterion        | AWS Secrets Manager ✅ | HashiCorp Vault ❌ |
|------------------|------------------------|-------------------|
| **Scalability**  | Horizontal by default; no capacity planning | Requires HA cluster (3+ nodes) |
| **Security**     | IAM-native; CloudTrail; auto-rotation | Equivalent, but more moving parts |
| **Cost**         | ~$8/month for 20 secrets | Free OSS + server cost + ops hours |
| **Integration**  | Native with Vercel, Atlas, Lambda | Requires Vault Agent sidecar or token refresh logic |
| **Ops overhead** | Zero — managed service | High — Vault must be operated, backed up, unsealed |
| **Serverless**   | ✅ Perfect fit — SDK call per request | ❌ Token expiry is a cold-start problem |

**Verdict:** AWS Secrets Manager is the right choice for Hema Furniture's cloud-native,
serverless architecture. Vault's strengths (dynamic database credentials, complex ACL
policies, PKI) are not needed at this scale.

### Implementation (src/lib/secrets.ts)

- `_fetchFromAWS()` fully implemented using `@aws-sdk/client-secrets-manager`.
- Secrets stored under the path `hema/<SECRET_NAME>` (e.g. `hema/NEXTAUTH_SECRET`).
- Supports plain-string and JSON-wrapped (`{ "value": "..." }`) secret formats.
- `ResourceNotFoundException` → graceful fallback to `process.env` (non-critical secrets only).
- All other AWS errors → hard throw in production (fail-closed).
- 5-minute in-memory cache to amortise API call costs.
- Hot-rotation endpoint (`/api/secrets/rotate`) allows AWS Lambda to update the cache
  on key rotation without a restart.

### Activation Steps (Operator Runbook)

```bash
# 1. Install SDK
npm i @aws-sdk/client-secrets-manager

# 2. Create secrets in AWS Console
#    Service: Secrets Manager → Store a new secret (type: Other)
#    Name: hema/NEXTAUTH_SECRET, hema/MONGODB_URI, ...

# 3. Grant IAM permission
#    Policy: secretsmanager:GetSecretValue on arn:aws:secretsmanager:*:*:secret:hema/*
#    Attach to: Vercel deployment IAM user or EC2/ECS task role

# 4. Set environment variables (Vercel → Project Settings → Environment Variables)
SECRETS_PROVIDER=aws
AWS_REGION=me-south-1          # Bahrain — closest AWS region to Egypt
AWS_ACCESS_KEY_ID=<key>        # Only needed for Vercel; use IAM role for EC2/ECS
AWS_SECRET_ACCESS_KEY=<secret>
ROTATION_WEBHOOK_SECRET=<32-byte random>

# 5. Configure rotation Lambda (optional but recommended for NEXTAUTH_SECRET)
#    Secrets Manager → Select secret → Rotation → Enable → Custom Lambda
#    Lambda posts to: https://hemafurniture.com/api/secrets/rotate
```

---

## 3 — Authentication Hardening: bcrypt → argon2id Migration

### Background

V036 replaced `@node-rs/bcrypt` with `@node-rs/argon2` (argon2id variant). However,
users who registered **before** V036 still have bcrypt hashes (`$2b$...`) in the database.
When they try to log in, `argon2Verify()` receives an invalid hash format and throws —
which the error handler catches and returns `null`, silently preventing login.

V042 makes this failure **explicit, safe, and self-healing**.

### Changes

| Component | Change |
|-----------|--------|
| `UserSchema` | Added `mustResetPassword: Boolean` and `mustResetReason: String` fields |
| `auth.ts authorize()` | Detects `$2b$` / `$2a$` prefix → sets `mustResetPassword=true` → throws `PASSWORD_RESET_REQUIRED` |
| `auth.ts JWT callback` | Carries `mustResetPassword` in the JWT token |
| `middleware.ts` | Blocks all routes for `mustResetPassword` users except forgot/reset-password and auth signout |
| `reset-password route` | Clears `mustResetPassword` and `mustResetReason` after successful argon2id password set |
| `migrate-bcrypt-to-argon2.ts` | Batch migration script — flags bcrypt users, generates reset tokens, enqueues emails |

### Migration Flow (User Perspective)

```
User visits /login → enters credentials
  ↓
Auth detects $2b$ hash → sets mustResetPassword=true
  ↓
Login rejected with PASSWORD_RESET_REQUIRED
  ↓
Middleware redirects to /forgot-password?reason=reset_required
  ↓
User enters email → receives reset email
  ↓
User sets new password (argon2id) via /reset-password
  ↓
mustResetPassword cleared → user can log in normally
```

### Running the Migration

```bash
# Preview affected users (no writes)
npm run migrate:bcrypt:dry

# Execute migration (sends reset emails to all bcrypt users)
npm run migrate:bcrypt
```

The script is **idempotent** — already-flagged users are skipped on re-run.
Reset tokens are valid for **7 days**. After expiry, users can still trigger a new
reset via the standard forgot-password flow.

### Why No Transparent Migration?

A transparent approach (detect bcrypt hash → verify with bcrypt → re-hash with argon2id
on the same login) would preserve seamless login but requires keeping `@node-rs/bcrypt`
in the dependency tree. This:

1. Keeps a dependency that was removed for security reasons.
2. Never forces users with potentially compromised bcrypt hashes to change their password.
3. Violates the principle that the migration should be explicit and auditable.

The forced reset approach is more secure: it invalidates all bcrypt-era credentials and
ensures every active user has a fresh argon2id hash after V042.

---

## 4 — Version Consistency

| File | Before | After |
|------|--------|-------|
| `package.json` `.version` | `40.0.0` | `42.0.0` |
| `VERSION` | `40.0.0` | `42.0.0` |
| `CHANGELOG.md` | Latest entry `[9.0.0]` | `[42.0.0]` added |

All dependency versions remain at their current values (no version bumps in this release
to minimise risk surface for a security-focused patch).

---

## 5 — Codebase Integrity Review

The following controls were verified as present and correct in V042:

| Control | Status | Notes |
|---------|--------|-------|
| **RBAC** | ✅ | `ADMIN_ROLES` single source of truth in `constants.ts`; imported by middleware, auth, admin layout |
| **CSRF** | ✅ | Double-submit cookie pattern; rotating token; narrow exempt list; `/api/secrets/rotate` added to exempt |
| **Rate limiting** | ✅ | Redis sliding window; all auth endpoints rate-limited; GET /orders rate limited (FIND-004) |
| **Input sanitization** | ✅ | isomorphic-dompurify on all user text; Zod validation on all API inputs |
| **MFA** | ✅ | TOTP + backup codes; `mfaPending` JWT flag; middleware MFA gate |
| **CSP** | ✅ | Nonce-based; `unsafe-inline` removed; `report-uri` configurable via `CSP_REPORT_URI` |
| **HSTS** | ✅ | `max-age=63072000; includeSubDomains; preload` in middleware + vercel.json (prod only) |
| **Audit log** | ✅ | TTL-indexed (90-day default, 30-day floor); written on all privileged actions |
| **Account lockout** | ✅ | 5 failures → 15min lock; MFA failures tracked separately |
| **Password policy** | ✅ | Min 8, max 128, uppercase + number + special; same schema on register and reset |
| **Password reuse** | ✅ | NIST SP 800-63B: new password must differ from current hash |
| **Open redirect** | ✅ | `safeCallbackUrl()` in middleware validates same-origin; client-side `getSafeCallbackUrl()` |
| **Timing attacks** | ✅ | Constant-time user lookup responses; `crypto.timingSafeEqual` on secrets |
| **bcrypt hashes** | ✅ | **V042 NEW**: detected at login, rejected, user flagged for forced reset |
| **Secrets** | ✅ | **V042 NEW**: AWS Secrets Manager SDK implemented; rotation webhook live |
| **X-CSP-Nonce exposure** | ✅ | Response header intentionally removed (V039); nonce only in request headers |
| **Permission version** | ✅ | `pv` checked on every JWT refresh; role changes take effect immediately |

---

## 6 — Risk Register

| ID | Risk | Severity | Mitigation in V042 |
|----|------|----------|-------------------|
| AUTH-001 | Bcrypt users locked out without notice | HIGH → Mitigated | Migration script + email + clear error message |
| FIND-002 | Secrets stored in plain env vars in production | HIGH → Mitigated | AWS SM SDK implemented; rotation webhook live |
| SEC-ENV-01 | Fake CSP endpoint silently swallows violations | MED → Mitigated | Placeholder removed; documentation improved |
| ROT-01 | Secret rotation requires restart | MED → Mitigated | `/api/secrets/rotate` webhook + `rotateSecret()` |

---

## 7 — Assumptions

1. **AWS is available** to the deployment environment. If not, `SECRETS_PROVIDER=env`
   continues to work (development and pre-SM production).
2. **SMTP is operational** when `npm run migrate:bcrypt` is executed. If not, use
   `DRY_RUN=true` to get the list of affected users and send reset links manually.
3. **All bcrypt users are identifiable** by their hash prefix alone (`$2b$` / `$2a$`).
   No other hash formats (MD5, SHA-1, scrypt) are expected — if they exist, add detection
   to the migration script and `authorize()`.
4. **7-day reset token TTL** is sufficient. If users go on holiday or ignore emails,
   they can trigger a new reset via `/forgot-password` after the token expires.
5. **`@aws-sdk/client-secrets-manager` is added to dependencies** by the operator before
   activating `SECRETS_PROVIDER=aws`. The SDK is optional until then.

---

## 8 — Files Changed in V042

```
Modified:
  package.json                                    version 40.0.0 → 42.0.0, new scripts
  VERSION                                         40.0.0 → 42.0.0
  .env.example                                    CSP_REPORT_URI placeholder fixed; AWS vars added
  .env.production.template                        CSP_REPORT_URI section added
  public/.well-known/security.txt                 Expires updated; Hiring field added
  src/lib/secrets.ts                              AWS SM _fetchFromAWS() implemented
  src/lib/mongodb.ts                              mustResetPassword + mustResetReason fields
  src/lib/auth.ts                                 bcrypt detection + mustResetPassword JWT
  src/middleware.ts                               mustResetPassword enforcement block; CSRF exempt
  src/app/api/auth/reset-password/route.ts        clears mustResetPassword on success
  CHANGELOG.md                                    V042 entry added
  PROJECT_UPDATES.md                              this file

New:
  src/app/api/secrets/rotate/route.ts             AWS SM rotation webhook
  scripts/migrate-bcrypt-to-argon2.ts             bcrypt user migration script
```

---

*Generated by security audit cycle for HemaV042 · 2026-05-02*
