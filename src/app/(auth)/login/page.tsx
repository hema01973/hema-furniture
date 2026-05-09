'use client';
// src/app/(auth)/login/page.tsx — Ali001:
//  • FIX: post-signIn redirect now performs a hard navigation so the session
//    cookie is picked up by middleware/SSR on the destination page (previous
//    `router.replace` left middleware unaware of the just-set session, which
//    bounced the user back to /login → "login does nothing").
//  • Robust success check uses `res.ok` (not just `!res.error`) and always
//    consults `res.url` returned by NextAuth.
//  • Adds Arabic (i18n) labels driven by the same UI store as the rest of the app.
import { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useUIStore } from '@/store/cartStore';

// Hema033 FIX [CRIT-01 + HIGH-04]: Block Unicode slash variants and percent-encoded
// protocol-relative URLs (e.g. /%2Fevil.com → //evil.com after browser decode).
function getSafeCallbackUrl(value: string | null): string {
  if (!value) return '/';
  try {
    // Decode percent-encoding before checking so /%2Fevil.com is caught
    const decoded = decodeURIComponent(value);
    // Must start with / and must NOT be protocol-relative (//)
    if (!decoded.startsWith('/') || decoded.startsWith('//')) return '/';
    // Block Unicode path separators that some browsers treat as /
    // U+2215 ∕, U+29F5 ⧵, U+29F8 ⸸, U+29F9, U+FE68 ﹨, U+FF0F ／
    if (/[\u2215\u29f5\u29f8\u29f9\ufe68\uff0f]/.test(decoded)) return '/';
    // Parse as relative URL — if origin shifts away from placeholder, reject
    const url = new URL(decoded, 'https://x');
    if (url.origin !== 'https://x') return '/';
    return decoded;
  } catch {
    return '/';
  }
}

const T = {
  en: {
    brand:        'Hema Modern Furniture',
    subtitle:     'Sign in to your account',
    email:        'Email Address',
    emailPh:      'you@example.com',
    password:     'Password',
    forgot:       'Forgot password?',
    signIn:       'Sign In',
    signingIn:    'Signing in...',
    fillAll:      'Please fill all fields',
    invalid:      'Invalid email or password',
    welcome:      'Welcome back!',
    rateLimited:  'Too many attempts. Please wait a few minutes and try again.',
    noAccount:    "Don't have an account?",
    create:       'Create account',
    demo:         'Dev mode — use .env.local credentials',
    fillDemo:     'Fill dev credentials',
  },
  ar: {
    brand:        'هيما للأثاث العصري',
    subtitle:     'سجّل الدخول إلى حسابك',
    email:        'البريد الإلكتروني',
    emailPh:      'you@example.com',
    password:     'كلمة المرور',
    forgot:       'نسيت كلمة المرور؟',
    signIn:       'تسجيل الدخول',
    signingIn:    'جارٍ تسجيل الدخول...',
    fillAll:      'يرجى تعبئة جميع الحقول',
    invalid:      'بريد إلكتروني أو كلمة مرور غير صحيحة',
    welcome:      'أهلاً بعودتك!',
    rateLimited:  'محاولات كثيرة جدًا. الرجاء الانتظار بضع دقائق والمحاولة مرة أخرى.',
    noAccount:    'ليس لديك حساب؟',
    create:       'إنشاء حساب',
    demo:         'وضع التطوير — استخدم بيانات .env.local',
    fillDemo:     'تعبئة بيانات التطوير',
  },
} as const;

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl  = getSafeCallbackUrl(searchParams.get('callbackUrl'));
  const [form, setForm]       = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);
  const lang = useUIStore(s => s.lang);
  const t    = T[lang];
  const isAr = lang === 'ar';

  // Redirect if already logged in (e.g. opened /login in a new tab while signed in)
  useEffect(() => {
    if (status === 'authenticated') {
      const dest = ['admin', 'manager', 'staff'].includes(session?.user?.role ?? '') ? '/admin' : callbackUrl;
      router.replace(dest);
    }
  }, [status, session, router, callbackUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) { toast.error(t.fillAll); return; }
    setLoading(true);

    let res;
    try {
      res = await signIn('credentials', {
        email:    form.email.trim(),
        password: form.password,
        redirect: false,
        callbackUrl,
      });
    } catch (err) {
      setLoading(false);
      toast.error(t.invalid);
      return;
    }

    // Robust success detection: NextAuth returns { ok, status, error, url }
    if (!res || res.error || !res.ok) {
      setLoading(false);
      // 429 from our rate-limited handler comes back as a generic error string —
      // surface a friendlier message when status is 429.
      if (res?.status === 429) toast.error(t.rateLimited);
      else                     toast.error(t.invalid);
      return;
    }

    toast.success(t.welcome);

    // FIX: Use a hard navigation rather than `router.replace`. The session
    // cookie was just set on this response; client-side router.replace does
    // NOT trigger middleware/SSR with the new cookie reliably across browsers
    // — causing the destination page to be rendered as "unauthenticated" and
    // (in many setups) bounce the user back to /login. A full-document load
    // guarantees middleware sees the new cookie.
    const nextAuthDest = getSafeCallbackUrl(res.url ? new URL(res.url, window.location.origin).pathname : null);
    const dest = nextAuthDest !== '/' && !nextAuthDest.includes('/login') ? nextAuthDest : callbackUrl;
    window.location.assign(dest);
  };

  if (status === 'loading') return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#B8935A] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904] flex items-center justify-center px-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl shadow-lg p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <Link href="/" className={`${isAr ? 'font-arabic' : 'font-serif'} text-2xl font-semibold text-[#1A1208] dark:text-[#F0EBE2]`}>
              {t.brand}
            </Link>
            <p className={`text-sm text-gray-500 mt-1 ${isAr ? 'font-arabic' : ''}`}>{t.subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <label className={`block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 ${isAr ? 'font-arabic' : ''}`}>{t.email}</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder={t.emailPh}
                autoComplete="email"
                required
                dir="ltr"
                className="w-full rounded-lg border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A] focus:ring-2 focus:ring-[#B8935A]/10 transition-all"
              />
            </div>

            <div className="mb-6">
              <div className="flex justify-between items-center mb-1.5">
                <label className={`text-xs font-semibold text-gray-500 uppercase tracking-wider ${isAr ? 'font-arabic' : ''}`}>{t.password}</label>
                <Link href="/forgot-password" className={`text-xs text-[#B8935A] hover:underline ${isAr ? 'font-arabic' : ''}`}>{t.forgot}</Link>
              </div>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  dir="ltr"
                  className={`w-full rounded-lg border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A] focus:ring-2 focus:ring-[#B8935A]/10 transition-all ${isAr ? 'pl-10' : 'pr-10'}`}
                />
                <button type="button" onClick={() => setShowPw(v => !v)} className={`absolute ${isAr ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm`}>
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${isAr ? 'font-arabic' : ''}`}
            >
              {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{t.signingIn}</> : t.signIn}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#E8DDD0] dark:border-[#2A1F14] text-center">
            <p className={`text-sm text-gray-500 ${isAr ? 'font-arabic' : ''}`}>
              {t.noAccount}{' '}
              <Link href="/register" className="text-[#B8935A] font-semibold hover:underline">{t.create}</Link>
            </p>
          </div>

          {/* Admin hint in dev */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-xs text-amber-700 dark:text-amber-300 font-mono" dir="ltr">
                {t.demo}
              </p>
              <button
                type="button"
                onClick={() => setForm({ email: process.env.NEXT_PUBLIC_DEV_ADMIN_EMAIL ?? '', password: process.env.NEXT_PUBLIC_DEV_ADMIN_PASSWORD ?? '' })}
                className={`text-xs text-amber-600 underline mt-1 ${isAr ? 'font-arabic' : ''}`}
              >
                {t.fillDemo}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
