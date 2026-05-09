# HemaV086 — TypeScript Build Error Fix Report

> **Release:** HemaV086 · **Date:** 2026-05-09 · **Previous:** HemaV085 · **Version:** `0.86.0`

---

## المشكلة (The Problem)

### `src/lib/mongodb.ts:37` — `schema.pre()` — Overload مرفوض لـ `updateMany` و `deleteMany`

**الخطأ:**
```
Type error: No overload matches this call.
  The last overload gave the following error.
    Argument of type '"find" | "countDocuments" | "deleteMany" | "findOne" |
    "findOneAndUpdate" | "updateMany" | "aggregate" | "findByIdAndUpdate"'
    is not assignable to parameter of type 'RegExp | "createCollection"'.
```

---

## السبب الجذري (Root Cause)

الكود كان يستخدم `OPERATIONS.forEach()` لتسجيل middleware:

```ts
// ❌ الكود القديم — يسبب خطأ TypeScript
const OPERATIONS = ['find', 'findOne', ..., 'updateMany', 'deleteMany'] as const;

OPERATIONS.forEach(op => {
  schema.pre(op, function () { ... }); // ❌
  // TypeScript يرى union type — لكن schema.pre() لها overloads منفصلة
  // الـ overload resolver لا يستطيع مطابقة union مع أي overload واحدة
});
```

Mongoose يعرّف `schema.pre()` كـ overloaded function — كل operation لها signature منفصلة. عند تمرير union type، TypeScript يفشل في المطابقة. علاوة على ذلك، `updateMany` و `deleteMany` غير موجودتان في Mongoose TypeScript literal union أصلاً — وهذا قصور في الـ type declarations وليس في Mongoose نفسه.

---

## الإصلاح (The Fix)

```ts
// ✅ الكود الجديد
type MaxTimeable = {
  getOptions?: () => Record<string, unknown>;
  maxTimeMS: (ms: number) => void;
};

function applyMaxTimeMS(this: unknown) {
  const ctx = this as MaxTimeable;
  if (typeof ctx.getOptions === 'function') {
    const opts = ctx.getOptions();
    if (!opts.maxTimeMS) ctx.maxTimeMS(8000);
  }
}

// Operations موجودة في Mongoose types — تسجيل مباشر
schema.pre('find',             applyMaxTimeMS);
schema.pre('findOne',          applyMaxTimeMS);
schema.pre('findOneAndUpdate', applyMaxTimeMS);
schema.pre('findOneAndDelete', applyMaxTimeMS);
schema.pre('countDocuments',   applyMaxTimeMS);
schema.pre('aggregate',        applyMaxTimeMS);

// updateMany/deleteMany غير موجودتان في Mongoose pre() literal union
// (قصور في الـ types وليس في Mongoose نفسه) — نستخدم (as any) بأمان
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(schema.pre as any)('updateMany', applyMaxTimeMS);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(schema.pre as any)('deleteMany', applyMaxTimeMS);
```

**لماذا هذا الحل آمن؟**
- Mongoose فعلياً يدعم `updateMany` و `deleteMany` في `pre()` على مستوى الـ runtime
- `as any` هنا يحل قصور الـ type declarations فقط، لا يؤثر على الـ behavior
- `applyMaxTimeMS` نفسها مكتوبة بشكل type-safe بالكامل

**تحسينات إضافية:**
- استُبدل `forEach` بـ function مشتركة `applyMaxTimeMS` — يُزيل التكرار
- أُضيف `findOneAndDelete` التي كانت ناقصة من القائمة الأصلية
- أُزيل `findByIdAndUpdate` لأنه alias لـ `findOneAndUpdate` وليس operation مستقلة في الـ middleware

---

## الملفات المُغيَّرة

```
Modified:
  src/lib/mongodb.ts    — إعادة كتابة maxTimeMS plugin — إصلاح overload error
  VERSION               — 0.83.0 → 0.86.0
  package.json          — "version": "0.83.0" → "0.86.0"

New:
  HemaV086_Report.md    — هذا الملف
```

---

## نمط الخطأ للمرجع السريع

### متى يظهر هذا الخطأ؟
```
Type error: No overload matches this call.
  The last overload gave the following error.
    Argument of type '"X" | "Y"' is not assignable to parameter of type '...'
```

### السبب الدائم
تمرير union type لـ overloaded function لها signatures منفصلة لكل قيمة.

### الحل
- إذا كانت القيم موجودة في الـ types: سجّل كل واحدة منفردة
- إذا كانت القيم غير موجودة في الـ types (قصور في الـ declarations): استخدم `(fn as any)(value, handler)` مع تعليق يشرح السبب

---

*Generated for HemaV086 — 2026-05-09*
