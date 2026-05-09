# 🛡️ تقرير الأمان الشامل — HemaV035
**المشروع:** Hema Furniture — Next.js E-Commerce Platform  
**الإصدار:** V035 / 35.0.0  
**مبني على:** Hema033 (33.0.0)  
**تاريخ التقرير:** 2026-05-01  
**المرجع:** SECURITY_FIXES_Hema033.md  

---

## ملخص الحالة الكاملة لجميع الثغرات

| المعرف | الخطورة | الحالة في V033 | الحالة في V035 |
|--------|---------|---------------|---------------|
| CRIT-01 | 🔴 Critical | ✅ مُصلَح | ✅ موروث |
| HIGH-01 | 🟠 High | ✅ مُصلَح | ✅ موروث |
| HIGH-02 | 🟠 High | ✅ مُصلَح | ✅ موروث |
| HIGH-03 | 🟠 High | ✅ مُصلَح | ✅ موروث |
| HIGH-04 | 🟠 High | ✅ مُصلَح | ✅ موروث |
| HIGH-05 | 🟠 High | ✅ مُصلَح | ✅ موروث |
| MED-01  | 🟡 Medium | ✅ مُصلَح | ✅ موروث |
| MED-02  | 🟡 Medium | ⏳ معلَّق | ✅ **مُصلَح في V035** |
| MED-03  | 🟡 Medium | ⏳ معلَّق | ✅ **مُصلَح في V035** |
| MED-04  | 🟡 Medium | ✅ مُصلَح | ✅ موروث |
| MED-05  | 🟡 Medium | ✅ مُصلَح | ✅ موروث |
| MED-06  | 🟡 Medium | ⏳ معلَّق | ✅ **مُصلَح في V035** |
| LOW-01  | 🔵 Low | ✅ مُصلَح | ✅ موروث |
| LOW-02  | 🔵 Low | ✅ مُصلَح | ✅ موروث |
| LOW-04  | 🔵 Low | ⏳ معلَّق | ⏳ معلَّق (مخطط Q3) |
| INFO-01–03 | ℹ️ Info | 📋 موثَّق | 📋 موثَّق |

---

## ما تم إصلاحه في HemaV035

---

### ✅ [MED-02] — عداد منفصل لمحاولات MFA الفاشلة

**الملفات المُعدَّلة:**
- `src/lib/mongodb.ts`
- `src/app/api/auth/mfa/verify/route.ts`

**المشكلة في V033:**  
كانت محاولات MFA الفاشلة تُحتسب في حقل `failedLogins` المشترك مع محاولات كلمة المرور. هذا يُسبب مشكلتين:
1. **DoS عبر التشابك:** مهاجم يُرسل كلمات مرور خاطئة كثيرة يُقفل الحساب قبل أن يصل المستخدم إلى شاشة MFA أصلاً.
2. **استنزاف MFA:** مهاجم عنده كلمة المرور يُرسل رموز TOTP خاطئة ويستنزف حصة `failedLogins` مع إخفاء ذلك عن مراقبة المرحلة الأولى.

**الإصلاح المطبَّق:**

في `mongodb.ts` — إضافة حقل منفصل:
```typescript
// HemaV035 FIX [MED-02]: dedicated counter for MFA verification failures.
mfaFailedAttempts: { type: Number, default: 0, select: false },
```

في `mfa/verify/route.ts` — استخدام العداد الجديد:
```typescript
// BEFORE (V033): مشاركة العداد مع كلمة المرور
user.failedLogins = (user.failedLogins ?? 0) + 1;

// AFTER (V035): عداد مستقل لكل عامل مصادقة
user.mfaFailedAttempts = (user.mfaFailedAttempts ?? 0) + 1;
if (user.mfaFailedAttempts >= 5) {
  user.lockedUntil = new Date(Date.now() + 15 * 60_000);
}
// وعند النجاح: إعادة ضبط العداد المخصص فقط
user.mfaFailedAttempts = 0;
```

**ملاحظة بشأن Migration:**  
الحقل `mfaFailedAttempts` مُعرَّف بـ `default: 0` في Schema. المستندات الموجودة تُعامَل كـ `mfaFailedAttempts = 0` تلقائياً بواسطة Mongoose عند أول قراءة — لا حاجة لـ migration script مستقل. يُوصى بتشغيل:
```js
db.users.updateMany({ mfaFailedAttempts: { $exists: false } }, { $set: { mfaFailedAttempts: 0 } })
```
لتجنب `undefined` في أي استعلامات مباشرة على MongoDB.

---

### ✅ [MED-03] — `vercel.json` يكشف بنية الملفات الداخلية

**الملف المُعدَّل:** `.gitignore`

**المشكلة:**  
`vercel.json` يحتوي على:
- مسارات API الداخلية (`src/app/api/v1/orders/[id]/retry-payment/route.ts`)
- مسارات Cron endpoints (`/api/cron/cleanup`)
- إعدادات `maxDuration` التي تكشف أوقات المعالجة المتوقعة

كل هذه المعلومات تُسهّل على المهاجم رسم خريطة للـ attack surface.

**الإصلاح المطبَّق:**
```gitignore
# HemaV035 FIX [MED-03]: vercel.json reveals internal API function paths and
# cron endpoints. Exclude from repository; manage via Vercel dashboard
# or inject during CI deployment only.
vercel.json
```

**الإجراء المطلوب بعد النشر:**  
- حذف `vercel.json` من Git history إن كان commit موجود:
  ```bash
  git filter-branch --force --index-filter \
    'git rm --cached --ignore-unmatch vercel.json' HEAD
  ```
- إدارة الإعدادات عبر Vercel Dashboard أو secret file في CI pipeline.

---

### ✅ [MED-06] — Secret Cache لا يُنظَّف عند Hot Reload

**الملف المُعدَّل:** `src/lib/secrets.ts`

**المشكلة:**  
عند تغيير كود أي ملف في بيئة التطوير (Next.js HMR)، يُنشئ webpack وحدة جديدة لـ `secrets.ts` لكن الـ `_cache` القديمة تبقى في الذاكرة في بعض حالات الـ module graph. هذا يعني أن:
1. تغيير قيمة سر في `.env.local` لا يُطبَّق فوراً بدون restart كامل.
2. إن كان السر القديم مُخترَقاً، يبقى مستخدماً حتى بعد استبداله.

**الإصلاح المطبَّق:**
```typescript
// HemaV035 FIX [MED-06]: Clear secret cache on Next.js hot reload (dev only)
if (process.env.NODE_ENV === 'development') {
  const _mod = module as any;
  if (_mod.hot?.dispose) {
    _mod.hot.dispose(() => {
      clearSecretCache();
    });
  }
}
```

هذا الكود:
- يعمل **فقط** في `development` — لا تأثير على production
- يستخدم webpack HMR API المتوفر في Next.js dev server
- يُنظِّف الـ cache تلقائياً عند كل hot reload

---

## ما تم إصلاحه في Hema033 (موروث في V035)

### ✅ [CRIT-01 + HIGH-04] — Open Redirect في `getSafeCallbackUrl`
**الملف:** `src/app/(auth)/login/page.tsx`  
إعادة كتابة كاملة للدالة مع: `decodeURIComponent()` لكشف `%2F`، Regex لحجب 6 Unicode slash variants، و`new URL()` للتحقق من origin.

### ✅ [HIGH-01] — Missing ObjectId Validation في 5 مسارات
**الملفات:** `admin/reviews/[id]`، `orders/[id]/refund`، `orders/[id]/retry-payment`، `users/[id]`، `users/[id]/role`  
إضافة `validateObjectId(params.id)` في بداية كل handler.

### ✅ [HIGH-02] — NEXTAUTH_URL غير مطلوبة في الإنتاج
**الملف:** `src/lib/env/index.ts`  
إضافة `superRefine` check يرفض بدء التطبيق في production بدون `NEXTAUTH_URL`.

### ✅ [HIGH-03 + LOW-03] — SESSION_SECRET الزائد في CI
**الملف:** `.github/workflows/ci.yml`  
حذف `SESSION_SECRET` من 3 jobs غير مستخدمة.

### ✅ [HIGH-05] — Refund على طلب بقيمة صفر
**الملف:** `src/app/api/v1/orders/[id]/refund/route.ts`  
إضافة guard لـ `order.total <= 0` قبل استدعاء Paymob.

### ✅ [MED-01] — Guest Tracking يستخدم `$regex`
**الملف:** `src/app/api/v1/orders/track/route.ts`  
استبدال `$regex` بـ exact match مع email مُحوَّل إلى lowercase من Zod.

### ✅ [MED-04] — لا حد أدنى لـ `AUDIT_LOG_TTL_SECONDS`
**الملف:** `src/lib/mongodb.ts`  
إضافة floor بـ 30 يوماً مع fallback إلى 90 يوماً.

### ✅ [MED-05] — Redis Password في Process Args
**الملفات:** `docker-compose.yml` + `docker/redis.conf`  
نقل كلمة المرور إلى config file template بدلاً من `--requirepass`.

### ✅ [LOW-01] — `X-XSS-Protection` المهجور
**الملفات:** `src/middleware.ts` + `vercel.json`  
حذف الـ header المهجور.

### ✅ [LOW-02] — تناقض `Permissions-Policy`
**الملف:** `vercel.json`  
إضافة `interest-cohort=()` لتطابق `middleware.ts`.

---

## الثغرات المعلَّقة (تحتاج sprint مستقل)

### ⏳ [LOW-04] — next-auth v4 قريب من EOL
**السبب:** الترقية إلى Auth.js v5 تتطلب breaking changes واسعة في:
- `next-auth/jwt` API
- Session callback signatures
- Provider configuration format
- Custom pages integration

**التوصية:** تخطيط migration في Q3 مع بيئة staging منفصلة.  
**المخاطر حتى الترقية:** لا ثغرات نشطة معروفة في v4.24.x، لكن لن يحصل على patches أمنية بعد EOL.

---

## ملخص الملفات المُعدَّلة في HemaV035

| الملف | التعديل |
|-------|---------|
| `src/lib/mongodb.ts` | إضافة حقل `mfaFailedAttempts` إلى UserSchema |
| `src/app/api/auth/mfa/verify/route.ts` | استخدام `mfaFailedAttempts` بدلاً من `failedLogins` |
| `src/lib/secrets.ts` | إضافة `module.hot.dispose` hook لـ dev environment |
| `.gitignore` | إضافة `vercel.json` إلى قائمة التجاهل |
| `CHANGELOG.md` | إضافة إدخال v35.0.0 |
| `VERSION` | تحديث إلى 35.0.0 |
| `package.json` | تحديث version إلى 35.0.0 |

---

## الإجراءات المطلوبة بعد النشر

### إجراءات فورية
1. **[MED-02]** تشغيل migration على قاعدة البيانات:
   ```js
   db.users.updateMany(
     { mfaFailedAttempts: { $exists: false } },
     { $set: { mfaFailedAttempts: 0 } }
   );
   ```

2. **[MED-03]** إزالة `vercel.json` من Git history:
   ```bash
   git filter-branch --force --index-filter \
     'git rm --cached --ignore-unmatch vercel.json' HEAD
   git push origin --force --all
   ```
   ثم نقل الإعدادات إلى Vercel Dashboard أو CI secret.

3. **[HIGH-02 — موروث]** التأكد من وجود `NEXTAUTH_URL` في متغيرات بيئة الإنتاج.

4. **[HIGH-03 — موروث]** حذف `SESSION_SECRET` من GitHub Secrets إن لم يُحذف بعد.

---

## التوصيات لتقوية المشروع في الإصدارات القادمة

### أمان التطبيق
| الأولوية | التوصية | الملف المقترح |
|----------|---------|---------------|
| 🔴 عالية | تطبيق `argon2id` بدلاً من `bcrypt` لتجزئة كلمات المرور | `src/lib/auth.ts` |
| 🔴 عالية | إضافة `integrity` hash لكل script خارجي في CSP | `src/middleware.ts` |
| 🟠 متوسطة | فحص `Content-Type` header في جميع API routes | `src/lib/api.ts` |
| 🟠 متوسطة | تطبيق `zod-to-openapi` لتوثيق API تلقائياً | `src/app/api/` |
| 🟠 متوسطة | إضافة `Idempotency-Key` header لـ payment endpoints | `orders/[id]/retry-payment` |
| 🟡 منخفضة | تحديث `next-auth` إلى Auth.js v5 | `package.json` |
| 🟡 منخفضة | إضافة `HPKP` header لتثبيت شهادة TLS | `src/middleware.ts` |

### جودة الكود والبنية
| الأولوية | التوصية | السبب |
|----------|---------|-------|
| 🔴 عالية | إضافة Integration tests لـ MFA flow بعد MED-02 | التحقق من أن العدادين مستقلان فعلياً |
| 🟠 متوسطة | نقل `ADMIN_ROLES` set إلى ملف constants مشترك | حالياً مُعرَّفة في `middleware.ts` و`authz.ts` بشكل منفصل |
| 🟠 متوسطة | إضافة `zod` validation لكل environment variable في CI | حماية إضافية قبل build |
| 🟡 منخفضة | تفعيل `strictNullChecks: true` بشكل كامل في tsconfig | بعض الملفات تستخدم `as any` لتجنب TS errors |

### المراقبة والتشغيل
| الأولوية | التوصية | السبب |
|----------|---------|-------|
| 🔴 عالية | إضافة alert تلقائي عند وصول `mfaFailedAttempts` إلى 3 | إنذار مبكر قبل القفل |
| 🟠 متوسطة | تفعيل MongoDB Atlas Performance Advisor | index recommendations تلقائية |
| 🟠 متوسطة | إضافة `healthcheck` endpoint لـ email queue | حالياً لا يوجد مؤشر على تراكم الرسائل |
| 🟡 منخفضة | إضافة `Prometheus` metrics لـ circuit breaker state | تتبع failures في Grafana |

---

## سجل الإصدارات الأمنية

| الإصدار | التاريخ | عدد الثغرات المُصلَحة |
|---------|---------|----------------------|
| V035 | 2026-05-01 | 3 (MED-02, MED-03, MED-06) |
| V033 | 2026-05-01 | 11 (CRIT-01, HIGH-01–05, MED-01, MED-04–05, LOW-01–02) |
| V031 | قبل V033 | Base version (audit reference) |

**الوضع الراهن:** جميع الثغرات من الفئة Critical وHigh وMedium مُصلَحة.  
المتبقي الوحيد هو LOW-04 (ترقية next-auth) المخطط لـ Q3.

---

*أُعدَّ هذا الملف تلقائياً كجزء من إصدار HemaV035 استناداً إلى SECURITY_FIXES_Hema033.md وتحليل كود المشروع*
