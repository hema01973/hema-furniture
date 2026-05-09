# HemaV093 – Build Fix: AUDIT_HMAC_SECRET Fatal at Build Time

**Version:** 0.93.0  
**Date:** 2026-05-09  
**Previous:** HemaV092 (0.92.0)  
**Status:** ✅ Build Error Resolved

---

## 🔴 Problem

`npm run build` failed at the "Collecting page data" phase:

```
Error: [AuditLog] FATAL: AUDIT_HMAC_SECRET must be set in production.
Without this secret, audit log entries cannot be HMAC-signed and integrity
verification is degraded.
...
[Error: Failed to collect page data for /api/auth/forgot-password]
```

### Root Cause

In `src/lib/mongodb.ts`, a **module-level guard** (top-level `if` outside any function) throws a fatal error when `AUDIT_HMAC_SECRET` is absent in `production`:

```js
// Line 454 — module-level, runs on import
if (process.env.NODE_ENV === 'production' && !process.env.AUDIT_HMAC_SECRET) {
  throw new Error('[AuditLog] FATAL: ...');
}
```

During `next build`:
- `NODE_ENV` is automatically set to `'production'` by Next.js.
- **Runtime secrets** (`AUDIT_HMAC_SECRET`, etc.) are intentionally **not** present in the build environment — they belong in the deployment runtime, not in the build pipeline.
- When Next.js collects page data, it imports route modules (e.g. `/api/auth/forgot-password`), which transitively import `mongodb.ts`, triggering the fatal throw **before the server ever starts**.

This is a build-time vs runtime confusion: the guard was designed to catch misconfigured deployments at startup, but it also fires harmlessly (and fatally) during the build step.

---

## ✅ Fix Applied

**File:** `src/lib/mongodb.ts`

Next.js exposes `process.env.NEXT_PHASE` to distinguish build from runtime:
- **Build phase:** `NEXT_PHASE === 'phase-production-build'`
- **Runtime:** `NEXT_PHASE` is unset or `'phase-production-server'`

### Change

```diff
- if (process.env.NODE_ENV === 'production' && !process.env.AUDIT_HMAC_SECRET) {
+ if (
+   process.env.NODE_ENV === 'production' &&
+   !process.env.AUDIT_HMAC_SECRET &&
+   process.env.NEXT_PHASE !== 'phase-production-build'
+ ) {
```

### Why this is correct and safe

| Scenario | Before fix | After fix |
|----------|-----------|-----------|
| `next build` (no secrets) | ❌ Fatal throw, build fails | ✅ Check skipped — build succeeds |
| Production server startup (no secret) | ✅ Fatal throw, server won't start | ✅ Fatal throw — still enforced |
| Production server startup (secret set) | ✅ No throw | ✅ No throw |
| Development | ✅ No throw (`NODE_ENV !== 'production'`) | ✅ No throw |

**Security is fully preserved:** The guard still prevents the server from starting without `AUDIT_HMAC_SECRET`. The only change is that the check is now skipped during the build phase, where it was never meaningful to begin with.

---

## Other Similar Patterns — Verified Safe

The following `throw` statements in `src/lib/secrets.ts` also check `NODE_ENV === 'production'` but are **inside async functions** (not module-level), so they cannot be triggered during the build's static import phase:

- `_fetchFromAWS()` — line 181, 189, 210
- `setSecretForTest()` — line 466

No changes needed for these.

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/mongodb.ts` | Added `NEXT_PHASE !== 'phase-production-build'` to AUDIT_HMAC_SECRET guard |
| `package.json` | Version bumped 0.92.0 → 0.93.0 |
| `VERSION` | Updated to 0.93.0 |
| `HemaV093_Report.md` | This report |
| `ALL_UPDATES.md` | Consolidated all version MD reports (updated) |

---

## Build Status After Fix

| Phase | Status |
|-------|--------|
| Compilation (webpack) | ✅ Warnings only (OpenTelemetry — upstream, non-blocking) |
| Type checking | ✅ Pass |
| Linting | ✅ Pass (ESLint warning cosmetic only) |
| Collecting page data | ✅ No longer throws |
| Static generation | ✅ Expected to complete |

---

## Notes on Remaining Build Warnings (Non-blocking)

These were present before V092 and require no action:

1. **OpenTelemetry `Critical dependency`** — from `@sentry/nextjs` internals. Known upstream issue; does not affect runtime.
2. **ESLint Next.js plugin not detected** — add `eslint-config-next` to ESLint config to silence; cosmetic only.
3. **`MODULE_TYPELESS_PACKAGE_JSON`** — add `"type": "module"` to `package.json` to silence; cosmetic only.
4. **Webpack big string serialization** — cache performance hint; does not affect build output.
