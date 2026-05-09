# HemaV091 — `src/lib/secrets.ts:229` — Impossible comparison `'env'` vs `'vault'`

> **Release:** HemaV091 · **Date:** 2026-05-09 · **Previous:** HemaV090 · **Version:** `0.91.0`

---

## المشكلة (The Problem)

```
./src/lib/secrets.ts:229:7
Type error: This comparison appears to be unintentional because the types
'"env"' and '"vault"' have no overlap.

  229 |   if (provider === 'vault') return _fetchFromVault(name);
      |       ^
```

---

## السبب الجذري (Root Cause)

```ts
// secrets.ts — السطر 156
type Provider = 'env' | 'aws';  // 'vault' ليست موجودة في الـ type

function activeProvider(): Provider {
  const p = process.env.SECRETS_PROVIDER ?? 'env';
  if (p === 'vault') throw new Error('[Secrets] vault not implemented');  // ← يرمي قبل الرجوع
  if (p === 'aws')   return 'aws';
  return 'env';
}

// بعدها:
async function _fetchExternal(name: SecretName) {
  const provider = activeProvider(); // provider: 'env' | 'aws'
  if (provider === 'aws')   return _fetchFromAWS(name);
  if (provider === 'vault') return _fetchFromVault(name); // ❌ مستحيل!
  //  ^^^^^^^^^^^^^^^^^ TypeScript يعلم أن 'vault' لا تنتمي لـ 'env' | 'aws'
}
```

`activeProvider()` تُعيد `Provider = 'env' | 'aws'`. وبما أن `'vault'` ليست جزءاً من هذا الـ union، فإن TypeScript يُحدد أن المقارنة `provider === 'vault'` مستحيلة تماماً ويُثير خطأ **TS2367** (no overlap).

هذا dead code: `_fetchFromVault` موجودة كـ tombstone تاريخي من V066 حين تم حذف Vault كـ provider مدعوم، لكن السطر الذي يستدعيها لم يُحذف.

---

## الإصلاح (The Fix)

```ts
// ❌ قبل — dead code يُثير TS2367
async function _fetchExternal(name: SecretName) {
  const provider = activeProvider();
  if (provider === 'aws')   return _fetchFromAWS(name);
  if (provider === 'vault') return _fetchFromVault(name); // مستحيل
  return undefined;
}

// ✅ بعد — حذف السطر الميت
async function _fetchExternal(name: SecretName) {
  // Provider type هو 'env' | 'aws' — activeProvider() تُرمي على 'vault'/'gcp' قبل الوصول هنا
  const provider = activeProvider();
  if (provider === 'aws') return _fetchFromAWS(name);
  return undefined;
}
```

`_fetchFromVault` تبقى في الملف كـ tombstone توثيقي (MED-04 fix V066) — لكن لا شيء يستدعيها.

---

## الملفات المُغيَّرة

```
Modified:
  src/lib/secrets.ts    — حذف السطر الميت provider === 'vault' من _fetchExternal()
  VERSION               — 0.90.0 → 0.91.0
  package.json          — "version" → "0.91.0"
New:
  HemaV091_Report.md    — هذا الملف
```

---

## النمط للمرجع السريع

```
Error: This comparison appears to be unintentional because the types 'X' and 'Y' have no overlap.
```

يظهر عند مقارنة variable بقيمة مستحيلة بسبب:
1. **Dead code** — كود لم يُحذف بعد تغيير الـ type (الحالة هنا)
2. **Control-flow narrowing** — TypeScript ضيّق النوع قبل هذه النقطة (Bug 2 في V084)

**الحل:** احذف السطر الميت أو صحّح الـ type ليشمل القيمة المقارَنة.

---

*Generated for HemaV091 — 2026-05-09*
