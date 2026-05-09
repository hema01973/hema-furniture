# HemaV087 — ESLint Rule Not Found Fix

> **Release:** HemaV087 · **Date:** 2026-05-09 · **Previous:** HemaV086 · **Version:** `0.87.0`

---

## المشكلة (The Problem)

### `src/lib/mongodb.ts:53,55` — ESLint rule `@typescript-eslint/no-explicit-any` not found

**الخطأ الكامل:**
```
./src/lib/mongodb.ts
53:3  Error: Definition for rule '@typescript-eslint/no-explicit-any' was not found.
55:3  Error: Definition for rule '@typescript-eslint/no-explicit-any' was not found.
```

---

## السبب الجذري (Root Cause)

الإصلاح في HemaV086 أضاف تعليقات `// eslint-disable-next-line @typescript-eslint/no-explicit-any`
لتجاوز استخدام `as any`. لكن المشروع يستخدم `eslint.config.js` (الـ flat config الجديد لـ ESLint v9)
ولا يتضمن `@typescript-eslint` plugin ضمن الإعداد الفعلي — لذا ESLint لا يعرف هذه القاعدة
ويُعاملها كـ error بدلاً من تجاهلها.

```js
// eslint.config.js — المشروع يستخدم flat config
// @typescript-eslint/no-explicit-any غير مُسجَّل كـ plugin
// → أي تعليق يشير إليها يُعتبر خطأ
```

---

## الإصلاح (The Fix)

حذف تعليقات `eslint-disable` تماماً واستبدال `as any` بـ double-cast
`as unknown as (m: string, fn: typeof applyMaxTimeMS) => void`
وهو cast آمن يحل المشكلة دون الحاجة لأي تعليق ESLint:

```ts
// ❌ HemaV086 — يسبب ESLint error
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(schema.pre as any)('updateMany', applyMaxTimeMS);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(schema.pre as any)('deleteMany', applyMaxTimeMS);

// ✅ HemaV087 — لا يحتاج ESLint comment
(schema.pre as unknown as (m: string, fn: typeof applyMaxTimeMS) => void)('updateMany', applyMaxTimeMS);
(schema.pre as unknown as (m: string, fn: typeof applyMaxTimeMS) => void)('deleteMany', applyMaxTimeMS);
```

**لماذا `as unknown as T` أفضل من `as any`؟**
- لا يُسكت ESLint ولا يحتاج تعليقات
- TypeScript يقبله لأن `unknown` هو supertype لكل شيء — يمكن cast أي شيء إليه أولاً
- النوع النهائي `(m: string, fn: typeof applyMaxTimeMS) => void` يحافظ على type safety جزئي

---

## الملفات المُغيَّرة

```
Modified:
  src/lib/mongodb.ts    — استبدال as any + eslint-disable بـ double-cast آمن
  VERSION               — 0.86.0 → 0.87.0
  package.json          — "version": "0.86.0" → "0.87.0"

New:
  HemaV087_Report.md    — هذا الملف
```

---

## نمط الخطأ للمرجع السريع

### متى يظهر هذا الخطأ؟
```
Error: Definition for rule '@typescript-eslint/no-explicit-any' was not found.
```
يظهر عند استخدام `// eslint-disable-next-line @typescript-eslint/...`
في مشروع لا يُسجّل `@typescript-eslint` كـ plugin في `eslint.config.js`.

### الحل العام
بدلاً من `as any`:
```ts
(fn as unknown as (arg: ExpectedType) => ReturnType)(arg);
```

---

*Generated for HemaV087 — 2026-05-09*
