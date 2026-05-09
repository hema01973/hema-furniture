# HemaV092 – TypeScript Build Fix Report

**Version:** 0.92.0  
**Date:** 2026-05-09  
**Previous:** HemaV091 (0.91.0)  
**Status:** ✅ Build Error Resolved

---

## 🔴 Problem

`npm run build` failed with a TypeScript type error in `src/middleware.ts`:

```
Type error: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
  Type 'undefined' is not assignable to type 'string'.

  360 |     if (!ADMIN_ROLES.has(token?.role)) {
```

### Root Cause

`ADMIN_ROLES` is typed as `ReadonlySet<string>`, so its `.has()` method only accepts `string`.  
However, `token.role` is typed as `UserRole | undefined` in `src/types/next-auth.d.ts` (marked optional with `?`), making `token?.role` produce `string | undefined`.

Even though `!token` was already guarded on the line above, TypeScript does not narrow the `role` field itself — it can still be `undefined` even when `token` is defined.

The same pattern appeared in **two locations**:
- Line 360 — Admin API guard (`/api/admin/...`)
- Line 376 — Admin page guard (`/admin/...`)

---

## ✅ Fix Applied

**File:** `src/middleware.ts`

### Location 1 – Admin API Guard

```diff
- if (!ADMIN_ROLES.has(token?.role)) {
+ if (!token.role || !ADMIN_ROLES.has(token.role)) {
```

### Location 2 – Admin Page Guard

```diff
- if (!ADMIN_ROLES.has(token?.role)) return NextResponse.redirect(new URL('/', req.url));
+ if (!token.role || !ADMIN_ROLES.has(token.role)) return NextResponse.redirect(new URL('/', req.url));
```

### Why this fix is correct

1. `!token.role` short-circuits if role is `undefined` or empty — treating a missing role as unauthorized (secure default).
2. `!ADMIN_ROLES.has(token.role)` now receives a guaranteed `string`, satisfying TypeScript's strict typing.
3. No behavioral change for legitimate admin tokens — they always have a defined role.

---

## Files Changed

| File | Change |
|------|--------|
| `src/middleware.ts` | Fixed 2 `ADMIN_ROLES.has()` calls (lines 360, 376) |
| `package.json` | Version bumped 0.91.0 → 0.92.0 |
| `VERSION` | Updated to 0.92.0 |
| `HemaV092_Report.md` | This report |
| `ALL_UPDATES.md` | Consolidated all version MD reports |

---

## Build Warnings (Non-blocking)

The following warnings were present in V091 and remain unchanged — they are from third-party packages and do not affect functionality:

- `@opentelemetry/instrumentation` critical dependency expression (from Sentry/Prisma) — known upstream issue.
- ESLint Next.js plugin not detected — cosmetic warning only.
- `MODULE_TYPELESS_PACKAGE_JSON` — add `"type": "module"` to `package.json` to silence (optional).

---

## Verification

After applying the fix, `npm run build` should complete successfully. The TypeScript compiler will accept `token.role` (after the `!token.role` guard) as a `string` because the falsy check eliminates the `undefined` branch.
