'use client';
// src/app/(auth)/login/page.tsx
import { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl  = searchParams.get('callbackUrl') || '/';
  const [form, setForm]       = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(session?.user.role === 'admin' ? '/admin' : callbackUrl);
    }
  }, [status, session, router, callbackUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) { toast.error('Please fill all fields'); return; }
    setLoading(true);
    const res = await signIn('credentials', { email: form.email, password: form.password, redirect: false });
    setLoading(false);
    if (res?.error) {
      toast.error('Invalid email or password');
    } else {
      toast.success('Welcome back!');
      router.replace(callbackUrl);
    }
  };

  if (status === 'loading') return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#B8935A] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl shadow-lg p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <Link href="/" className="font-serif text-2xl font-semibold text-[#1A1208] dark:text-[#F0EBE2]">
              Hema Modern Furniture
            </Link>
            <p className="text-sm text-gray-500 mt-1">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email Address</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full rounded-lg border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A] focus:ring-2 focus:ring-[#B8935A]/10 transition-all"
              />
            </div>

            <div className="mb-6">
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Password</label>
                <Link href="/forgot-password" className="text-xs text-[#B8935A] hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-lg border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A] focus:ring-2 focus:ring-[#B8935A]/10 transition-all pr-10"
                />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Signing in...</> : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#E8DDD0] dark:border-[#2A1F14] text-center">
            <p className="text-sm text-gray-500">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-[#B8935A] font-semibold hover:underline">Create account</Link>
            </p>
          </div>

          {/* Admin hint in dev */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-xs text-amber-700 dark:text-amber-300 font-mono">
                Demo: admin@hemafurniture.com / admin123
              </p>
              <button
                type="button"
                onClick={() => setForm({ email: 'admin@hemafurniture.com', password: 'admin123' })}
                className="text-xs text-amber-600 underline mt-1"
              >
                Fill admin credentials
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
