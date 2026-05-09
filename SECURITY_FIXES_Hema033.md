# 🛡️ تقرير إصلاحات الأمان — Hema033
**المشروع:** Hema Furniture — Next.js E-Commerce Platform  
**الإصدار المُصلَح:** V033 / 33.0.0  
**مبني على:** HemaV031 (31.0.0)  
**تاريخ الإصلاح:** 2026-05-01  
**المرجع:** HemaV031_Security_Audit.md  

---

## ملخص ما تم إصلاحه

| المعرف | الخطورة | الحالة |
|--------|---------|--------|
| CRIT-01 | 🔴 Critical | ✅ مُصلَح |
| HIGH-01 | 🟠 High | ✅ مُصلَح |
| HIGH-02 | 🟠 High | ✅ مُصلَح |
| HIGH-03 | 🟠 High | ✅ مُصلَح |
| HIGH-04 | 🟠 High | ✅ مُصلَح (مدمج مع CRIT-01) |
| HIGH-05 | 🟠 High | ✅ مُصلَح |
| MED-01  | 🟡 Medium | ✅ مُصلَح |
| MED-04  | 🟡 Medium | ✅ مُصلَح |
| MED-05  | 🟡 Medium | ✅ مُصلَح |
| LOW-01  | 🔵 Low | ✅ مُصلَح |
| LOW-02  | 🔵 Low | ✅ مُصلَح |
| MED-02  | 🟡 Medium | ⏳ معلَّق (يحتاج تعديل Schema) |
| MED-03  | 🟡 Medium | ⏳ معلَّق (قرار إداري — gitignore vs next.config) |
| MED-06  | 🟡 Medium | ⏳ معلَّق (تحتاج hook في Next.js dev environment) |
| LOW-04  | 🔵 Low | ⏳ معلَّق (ترقية next-auth v5 — breaking changes) |
| INFO-01–03 | ℹ️ Info | 📋 موثَّق — لا إصلاح مطلوب |

---

## التفاصيل الكاملة لكل إصلاح

---

### ✅ [CRIT-01 + HIGH-04] — Open Redirect في `getSafeCallbackUrl`

**الملف:** `src/app/(auth)/login/page.tsx`

**المشكلة:**  
الدالة الأصلية كانت تفحص `//` فقط، لكنها لم تمنع:
- `/%2Fevil.com` (percent-encoded slash) — يُفسَّر كـ `//evil.com` في Chrome/Firefox عند `window.location.assign()`
- `/∕evil.com` (Unicode Division Slash U+2215) — يتجاوز فحص `startsWith('/')`

**الإصلاح المطبَّق:**
```typescript
// BEFORE (vulnerable):
function getSafeCallbackUrl(value: string | null): string {
  if (!value) return '/';
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//')) return '/';
  return value;
}

// AFTER (Hema033 — secure):
function getSafeCallbackUrl(value: string | null): string {
  if (!value) return '/';
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith('/') || decoded.startsWith('//')) return '/';
    if (/[\u2215\u29f5\u29f8\u29f9\ufe68\uff0f]/.test(decoded)) return '/';
    const url = new URL(decoded, 'https://x');
    if (url.origin !== 'https://x') return '/';
    return decoded;
  } catch {
    return '/';
  }
}
```

**التغييرات:**
1. `decodeURIComponent()` يكشف `%2F` قبل أي فحص
2. Regex يحجب 6 Unicode slash variants معروفة
3. `new URL()` مع origin placeholder يضمن عدم هروب أي مسار من النطاق

---

### ✅ [HIGH-01] — Missing ObjectId Validation في 5 مسارات

**الملفات المُصلَحة:**

| الملف | الـ Handler(s) |
|-------|---------------|
| `src/app/api/v1/admin/reviews/[id]/route.ts` | PATCH |
| `src/app/api/v1/orders/[id]/refund/route.ts` | POST |
| `src/app/api/v1/orders/[id]/retry-payment/route.ts` | POST |
| `src/app/api/v1/users/[id]/route.ts` | GET, PUT, PATCH, DELETE |
| `src/app/api/v1/users/[id]/role/route.ts` | PATCH |

**المشكلة:**  
`params.id` كان يُمرَّر مباشرة إلى `findById()` بدون فحص صيغة ObjectId. إدخال مثل `__proto__` أو `{"$gt":""}` يُطلق `CastError` من Mongoose — يُسرِّب stack trace في development ويسبب 500 غير متحكَّم في production.

**الإصلاح المطبَّق في كل ملف:**
```typescript
// في بداية كل handler بعد { params }:
const idErr = validateObjectId(params.id);
if (idErr) return idErr;
```

**ملاحظة:** `validateObjectId` كان مستورداً في `admin/reviews/[id]/route.ts` لكن غير مستدعى — أُضيف الاستدعاء. في `retry-payment` و `role`، أُضيف الاستيراد والاستدعاء معاً.

---

### ✅ [HIGH-02] — NEXTAUTH_URL غير مطلوبة في الإنتاج

**الملف:** `src/lib/env/index.ts`

**المشكلة:**  
غياب `NEXTAUTH_URL` في الإنتاج يجعل NextAuth يستنتج الـ URL من `Host` header — مما يتيح هجوم Host Header Injection على روابط إعادة تعيين كلمة المرور.

**الإصلاح المطبَّق:**
```typescript
// أُضيف في superRefine():
if (data.NODE_ENV === 'production' && !data.NEXTAUTH_URL) {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['NEXTAUTH_URL'],
    message: 'NEXTAUTH_URL must be set in production — missing it allows Host Header Injection in auth emails.' });
}
```

البيئة تفشل عند `NODE_ENV=production` بدون `NEXTAUTH_URL` — المشروع لا يبدأ.

---

### ✅ [HIGH-03 + LOW-03] — SESSION_SECRET الزائد في CI

**الملف:** `.github/workflows/ci.yml`

**المشكلة:**  
`SESSION_SECRET` كان مُعرَّفاً في ثلاثة jobs (test, build, e2e) دون أي استخدام في الكود المصدري — كل secret زائد في CI يرفع سطح الهجوم.

**الإصلاح المطبَّق:**  
حُذفت جميع أسطر `SESSION_SECRET: ${{ secrets.SESSION_SECRET }}` من jobs الثلاثة واستُبدلت بتعليق توضيحي.

---

### ✅ [HIGH-05] — Refund على طلب بقيمة صفر

**الملف:** `src/app/api/v1/orders/[id]/refund/route.ts`

**المشكلة:**  
طلب مجاني بالكامل (كوبون 100%) يعطي `order.total = 0`. تمرير `amount = 0` إلى Paymob يسبب سلوكاً غير محدد (بعض gateways تعتبره refund كامل).

**الإصلاح المطبَّق:**
```typescript
// BEFORE:
const refundAmount = Math.min(v.data.amount ?? order.total, order.total);
if (refundAmount <= 0) return err('Refund amount must be greater than zero', 400);

// AFTER (Hema033):
if (order.total <= 0) return err('Cannot refund a zero-value order', 400); // ← جديد
const refundAmount = Math.min(v.data.amount ?? order.total, order.total);
if (refundAmount <= 0) return err('Refund amount must be greater than zero', 400);
```

---

### ✅ [MED-01] — Guest Tracking يستخدم `$regex` بدلاً من Exact Match

**الملف:** `src/app/api/v1/orders/track/route.ts`

**المشكلة:**  
`$regex` مع flag `'i'` يمنع MongoDB من استخدام الـ index على `guestEmail` → full collection scan عند كل طلب tracking على endpoint غير مُصادَق.

**الإصلاح المطبَّق:**
```typescript
// BEFORE:
guestEmail: { $regex: new RegExp(`^${email.replace(/.../, '\\$&')}$`, 'i') },

// AFTER (Hema033):
guestEmail: email, // exact match — email already lowercased by Zod schema
```

Zod schema يحوِّل email إلى lowercase (`.toLowerCase()`) قبل الوصول إلى MongoDB، لذا البحث exact match كافٍ ومتطابق مع البيانات المخزَّنة.

---

### ✅ [MED-04] — لا حد أدنى لـ `AUDIT_LOG_TTL_SECONDS`

**الملف:** `src/lib/mongodb.ts`

**المشكلة:**  
`AUDIT_LOG_TTL_SECONDS=1` كان يُحذف جميع سجلات التدقيق خلال ثانية — insider threat يستطيع محو أثره.

**الإصلاح المطبَّق:**
```typescript
// BEFORE:
const AUDIT_TTL_S = parseInt(process.env.AUDIT_LOG_TTL_SECONDS ?? String(90 * 24 * 3600));

// AFTER (Hema033):
const _parsedTTL = parseInt(process.env.AUDIT_LOG_TTL_SECONDS ?? '');
const MIN_AUDIT_TTL = 30 * 24 * 3600; // 30 days minimum
const AUDIT_TTL_S = (!isNaN(_parsedTTL) && _parsedTTL >= MIN_AUDIT_TTL)
  ? _parsedTTL
  : 90 * 24 * 3600; // default: 90 days
```

القيمة الدنيا 30 يوماً. أي قيمة أقل تُتجاهل وتُستبدل بـ 90 يوماً.

---

### ✅ [MED-05] — Redis Password في Process Args

**الملفات:** `docker-compose.yml` + `docker/redis.conf` (جديد)

**المشكلة:**  
`--requirepass ${REDIS_PASSWORD}` في `command:` يُظهر كلمة المرور في `ps aux` و `/proc/[pid]/cmdline`.

**الإصلاح المطبَّق:**
```yaml
# BEFORE:
command:
  - redis-server
  - --appendonly
  - "yes"
  - --requirepass
  - "${REDIS_PASSWORD:?REDIS_PASSWORD is required}"

# AFTER (Hema033):
entrypoint: ["/bin/sh", "-c"]
command:
  - |
    sed "s/REDIS_PASSWORD_PLACEHOLDER/$$REDIS_PASSWORD/" /etc/redis/redis.conf.tpl > /tmp/redis.conf
    exec redis-server /tmp/redis.conf
environment:
  REDIS_PASSWORD: ${REDIS_PASSWORD:?REDIS_PASSWORD is required}
volumes:
  - ./docker/redis.conf:/etc/redis/redis.conf.tpl:ro
```

كلمة المرور تُكتب في `/tmp/redis.conf` الذي لا يظهر في `ps aux`.

**ملف `docker/redis.conf` الجديد:**
```
appendonly yes
requirepass REDIS_PASSWORD_PLACEHOLDER
```

---

### ✅ [LOW-01] — `X-XSS-Protection` المهجور

**الملفات:** `src/middleware.ts` + `vercel.json`

**المشكلة:**  
`X-XSS-Protection: 1; mode=block` مهجور منذ Chrome v78، لم يُدعَم قط في Firefox، ويمكن أن يُسبِّب ثغرات في المتصفحات القديمة.

**الإصلاح:**  
حُذف السطر من `middleware.ts` وحُذفت القيمة من `vercel.json`. CSP المبنية على nonce تُغني عنه كلياً.

---

### ✅ [LOW-02] — تناقض `Permissions-Policy`

**الملف:** `vercel.json`

**المشكلة:**  
`vercel.json` كان يفتقد `interest-cohort=()` بينما `middleware.ts` يُضيفها.

**الإصلاح:**
```json
// BEFORE:
"camera=(), microphone=(), geolocation=(), payment=()"

// AFTER (Hema033):
"camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()"
```

السياسة الآن متطابقة في كلا الملفين.

---

## الثغرات المعلَّقة (تحتاج قرار أو عمل إضافي)

### ⏳ [MED-02] — لا عداد لمحاولات MFA الفاشلة
**السبب:** يحتاج إضافة حقل `mfaFailedAttempts` إلى MongoDB User Schema مع migration — عمل يتجاوز نطاق patch بسيط.  
**التوصية:** إضافة في Sprint القادم مع schema migration.

### ⏳ [MED-03] — `vercel.json` يكشف بنية الملفات
**السبب:** نقل `functions` config إلى `next.config.js` قد يتطلب اختبار deployment كامل.  
**التوصية:** إضافة `vercel.json` إلى `.gitignore` هي الحل الأسرع.

### ⏳ [MED-06] — Secret Cache لا يُنظَّف عند Hot Reload
**السبب:** يحتاج Hook في Next.js dev environment (`module.hot.dispose`) — لا يؤثر على production.  
**التوصية:** إضافة في بيئة التطوير فقط بشرط `process.env.NODE_ENV === 'development'`.

### ⏳ [LOW-04] — next-auth v4 قريب من EOL
**السبب:** الترقية إلى Auth.js v5 تتطلب breaking changes واسعة.  
**التوصية:** تخطيط migration في Q3 مع بيئة اختبار منفصلة.

---

## ملخص الملفات المُعدَّلة

| الملف | التعديلات |
|-------|-----------|
| `src/app/(auth)/login/page.tsx` | إعادة كتابة `getSafeCallbackUrl` بالكامل |
| `src/app/api/v1/admin/reviews/[id]/route.ts` | إضافة استدعاء `validateObjectId` |
| `src/app/api/v1/orders/[id]/refund/route.ts` | إضافة import + استدعاء `validateObjectId` + حارس zero-total |
| `src/app/api/v1/orders/[id]/retry-payment/route.ts` | إضافة import + استدعاء `validateObjectId` |
| `src/app/api/v1/users/[id]/route.ts` | إضافة `validateObjectId` في GET, PUT, PATCH, DELETE |
| `src/app/api/v1/users/[id]/role/route.ts` | إضافة import + استدعاء `validateObjectId` |
| `src/app/api/v1/orders/track/route.ts` | استبدال `$regex` بـ exact match |
| `src/lib/env/index.ts` | إضافة تحقق `NEXTAUTH_URL` في production |
| `src/lib/mongodb.ts` | إضافة حد أدنى 30 يوم لـ AUDIT_LOG_TTL |
| `src/middleware.ts` | حذف `X-XSS-Protection` |
| `vercel.json` | حذف `X-XSS-Protection` + إضافة `interest-cohort` |
| `docker-compose.yml` | نقل Redis password إلى config file |
| `docker/redis.conf` | ملف جديد — Redis config template |
| `.github/workflows/ci.yml` | حذف `SESSION_SECRET` من 3 jobs |
| `CHANGELOG.md` | إضافة إدخال v33.0.0 |
| `VERSION` | تحديث إلى 33.0.0 |

---

## الإجراءات المطلوبة بعد النشر

1. **حذف `SESSION_SECRET` من GitHub Secrets** — لم يعد مستخدماً في CI.
2. **إضافة `NEXTAUTH_URL`** إلى متغيرات بيئة الإنتاج (Vercel / .env.production).
3. **تحديث `docker/redis.conf`** — استبدال `REDIS_PASSWORD_PLACEHOLDER` بكلمة المرور الفعلية أو استخدام آلية secrets الخاصة بـ Docker Swarm/K8s.
4. **إضافة `vercel.json` إلى `.gitignore`** إن كان هناك private config (اختياري — MED-03).

---

*أُعدَّ هذا الملف تلقائياً كجزء من عملية إصلاح Hema033 استناداً إلى تقرير HemaV031_Security_Audit.md*
