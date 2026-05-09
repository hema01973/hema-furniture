# دليل ترقية next-auth — مراجعة أمنية إلزامية

**السبب:** `next-auth` لا يزال في مرحلة beta (5.0.0-beta.x).  
الإصدارات التجريبية يمكن أن تحتوي على تغييرات أمنية كسر (breaking security changes) دون إشعار مسبق.

---

## قبل أي ترقية — قائمة التحقق الإلزامية

### 1. مراجعة CHANGELOG
```
https://github.com/nextauthjs/next-auth/releases
```
ابحث عن:
- `security` / `vulnerability` / `CVE` في ملاحظات الإصدار
- تغييرات في JWT signing أو session handling
- تغييرات في callback URLs أو CSRF protection
- تغييرات في adapter interface (MongoDB adapter)

### 2. مراجعة الـ Advisories
```
https://github.com/nextauthjs/next-auth/security/advisories
npm audit --production
```

### 3. اختبار بيئة Staging قبل الإنتاج
- [ ] تسجيل دخول عادي (email/password)
- [ ] تسجيل دخول + MFA (TOTP)
- [ ] دورة كاملة: تسجيل → verify email → تسجيل دخول
- [ ] JWT expiry وrefresh token behavior
- [ ] `permissionVersion` invalidation (الـ JWT versioning المخصص)
- [ ] CSRF token flow على mutating requests
- [ ] Admin routes protection
- [ ] Redirect loops (callbackUrl validation)

### 4. ملفات تتأثر بالترقية
| الملف | السبب |
|---|---|
| `src/app/api/auth/[...nextauth]/route.ts` | Auth handlers |
| `src/lib/auth.ts` | Session/JWT callbacks |
| `src/types/next-auth.d.ts` | Type augmentation |
| `src/middleware.ts` | `getToken()` usage |
| `src/lib/authz.ts` | `getAuthSession()` usage |

### 5. خطوات الترقية
```bash
# 1. تحقق من الإصدار المتاح
npm outdated next-auth

# 2. اقرأ CHANGELOG من beta.28 إلى الإصدار الهدف

# 3. ابدأ في فرع منفصل
git checkout -b upgrade/next-auth-X.Y.Z

# 4. الترقية
npm install next-auth@X.Y.Z

# 5. شغّل الاختبارات
npm run test
npm run test:e2e

# 6. راجع التغييرات في auth.ts و next-auth.d.ts

# 7. اختبر يدوياً على staging

# 8. PR مع مراجعة من شخصين على الأقل
```

### 6. الرجوع للخلف (Rollback)
```bash
npm install next-auth@5.0.0-beta.28
# أو استخدم package-lock.json المحفوظ
```

---

## الإصدار الحالي
- `next-auth`: `5.0.0-beta.28`
- تاريخ آخر مراجعة: 2026-05-05 (HemaV054)

---

## الانتقال للإصدار GA
عندما يُطلق next-auth الإصدار `5.0.0` (GA):
1. راجع migration guide الرسمي
2. أزل `NEXT_AUTH_UPGRADE_GUIDE.md` هذا
3. أزل `ignore` block من `.github/dependabot.yml`
4. اتبع قائمة التحقق أعلاه
