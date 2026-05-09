# HemaV090 — `src/lib/role.service.ts:79` — Parameter `u` implicitly has `any` type

> **Release:** HemaV090 · **Date:** 2026-05-09 · **Previous:** HemaV089 · **Version:** `0.90.0`

---

## المشكلة (The Problem)

```
./src/lib/role.service.ts:79:46
Type error: Parameter 'u' implicitly has an 'any' type.

  79 |   const mapped: UserWithRoles[] = users.map((u) => {
     |                                              ^
```

---

## السبب الجذري (Root Cause)

```ts
const [users, total] = await Promise.all([
  (User.find as any)()   // ← (as any) يجعل كل السلسلة تُعيد any
    .select(...)
    .lean(),             // lean(): any
  User.countDocuments(),
]);
// users: any
// users.map((u) => ...) → u: any → خطأ noImplicitAny
```

عند استخدام `(User.find as any)()` تنتقل `any` عبر كامل سلسلة الـ method calls حتى `.lean()`.
الناتج `users` نوعه `any`، وعند `users.map((u) => ...)` يصبح `u` ضمنياً `any` مما يُثير `noImplicitAny`.

---

## الإصلاح (The Fix)

### الخطوة 1: تعريف `RawUserDoc` type alias يُمثّل نتيجة `.lean()`

```ts
/** Shape returned by .lean() for the user listing query. */
type RawUserDoc = {
  _id: import('mongoose').Types.ObjectId;
  email: string;
  name?: string;
  isEmailVerified?: boolean;
  mfaEnabled?: boolean;
  roles?: string[];
  role?: string;
  createdAt: Date;
};
```

### الخطوة 2: Cast نتيجة `.lean()` إلى `Promise<RawUserDoc[]>`

```ts
// ❌ قبل
(User.find as any)().select(...).lean(),

// ✅ بعد
(User.find as any)().select(...).lean() as Promise<RawUserDoc[]>,
```

### الخطوة 3: تبسيط الـ `.map()` callback

```ts
// ❌ قبل — cast ضخم داخل callback
users.map((u) => {
  const doc = u as { _id: mongoose.Types.ObjectId; email: string; ... };
  ...
})

// ✅ بعد — نوع u مُعرَّف من RawUserDoc[]
users.map((u: RawUserDoc) => {
  const doc = u;  // doc: RawUserDoc — لا حاجة لـ cast
  ...
})
```

**لماذا هذا أفضل؟**
- `RawUserDoc` مُعرَّف مرة واحدة في مكان واضح — سهل الصيانة
- الـ `.map()` callback يحصل على نوع صريح بدون inline cast ضخم
- يُزيل التكرار: نفس الـ shape كانت مُعرَّفة مرتين (في `.lean()` cast وفي الـ callback)

---

## الملفات المُغيَّرة

```
Modified:
  src/lib/role.service.ts   — إضافة RawUserDoc type، cast lean()، تبسيط map()
  VERSION                   — 0.89.0 → 0.90.0
  package.json              — "version" → "0.90.0"
New:
  HemaV090_Report.md        — هذا الملف
```

---

## النمط للمرجع السريع

```ts
// المشكلة: (X as any).method() يُعيد any → map callback يشتكي
const results = await (Model.find as any)().lean(); // results: any
results.map((r) => r.field); // ❌ r: any → noImplicitAny

// الحل: cast نتيجة lean() إلى نوع محدد
type DocShape = { _id: ...; field: string };
const results = await (Model.find as any)().lean() as Promise<DocShape[]>;
results.map((r: DocShape) => r.field); // ✅
```

---

*Generated for HemaV090 — 2026-05-09*
