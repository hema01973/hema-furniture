'use client';
import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get('token') ?? '';
  const [form, setForm]       = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] dark:bg-[#0E0904] px-4">
      <div className="text-center"><div className="text-5xl mb-4">❌</div>
        <p className="text-gray-400 mb-4">Invalid or missing reset token.</p>
        <Link href="/forgot-password" className="text-[#B8935A] hover:underline">Request a new link</Link>
      </div>
    </div>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: form.password }) });
      const data = await res.json();
      if (data.success) { toast.success('Password reset! Please sign in.'); router.replace('/login'); }
      else toast.error(data.error ?? 'Failed');
    } catch { toast.error('Network error'); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <Link href="/" className="font-serif text-2xl font-semibold text-[#1A1208] dark:text-[#F0EBE2]">Hema Furniture</Link>
            <p className="text-sm text-gray-500 mt-1">Create a new password</p>
          </div>
          <form onSubmit={handleSubmit}>
            {(['password','confirm'] as const).map(field => (
              <div key={field} className="mb-4">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  {field === 'password' ? 'New Password' : 'Confirm Password'}
                </label>
                <input type={showPw ? 'text' : 'password'} value={form[field]} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))} placeholder="••••••••" required
                  className="w-full rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A]" />
              </div>
            ))}
            <label className="flex items-center gap-2 cursor-pointer mb-5 text-sm text-gray-500">
              <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} className="w-4 h-4 accent-[#B8935A]" />
              Show passwords
            </label>
            <button type="submit" disabled={loading}
              className="w-full bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Resetting...</> : 'Reset Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
