# HemaV088 — `src/lib/mongodb.ts:105` — `err.message` on `unknown` type

> **Release:** HemaV088 · **Date:** 2026-05-09 · **Previous:** HemaV087 · **Version:** `0.88.0`

---

## المشكلة (The Problem)

```
./src/lib/mongodb.ts:105:62
Type error: 'err' is of type 'unknown'.

  105 |         logger.error('[MongoDB] Connection failed', { error: err.message });
      |                                                              ^
```

---

## السبب الجذري (Root Cause)

الـ `.catch()` callback يُعرّف `err` كـ `unknown` (TypeScript strict mode).
الوصول المباشر إلى `err.message` مرفوض لأن `unknown` لا يضمن وجود أي خاصية.

```ts
// ❌ خاطئ
.catch((err: unknown) => {
  logger.error('...', { error: err.message }); // Property 'message' does not exist on 'unknown'
})
```

---

## الإصلاح (The Fix)

```ts
// ✅ مُصلَح — type guard قبل الوصول للخاصية
.catch((err: unknown) => {
  logger.error('[MongoDB] Connection failed', {
    error: err instanceof Error ? err.message : String(err)
  });
  throw err;
})
```

`instanceof Error` يُضيّق النوع إلى `Error` فيسمح TypeScript بالوصول إلى `.message`.
`String(err)` fallback يتعامل مع أي قيمة مرمية غير `Error` (string, number, object...).

---

## النمط للمرجع السريع

```ts
// بدلاً من err.message على unknown:
err instanceof Error ? err.message : String(err)

// بدلاً من err.stack على unknown:
err instanceof Error ? err.stack : String(err)
```

---

## الملفات المُغيَّرة

```
Modified:
  src/lib/mongodb.ts    — السطر 105 — type guard على err
  VERSION               — 0.87.0 → 0.88.0
  package.json          — "version" → "0.88.0"
New:
  HemaV088_Report.md    — هذا الملف
```

---

*Generated for HemaV088 — 2026-05-09*
