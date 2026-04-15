'use client';
import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent]   = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (data.success) setSent(true);
      else toast.error(data.error ?? 'Something went wrong');
    } catch { toast.error('Network error. Please try again.'); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl shadow-lg p-8">
          {sent ? (
            <div className="text-center">
              <div className="text-5xl mb-4">📧</div>
              <h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-3">Check Your Email</h2>
              <p className="text-gray-400 text-sm mb-6">If <strong>{email}</strong> is registered, a reset link has been sent. Check your spam folder too.</p>
              <Link href="/login" className="text-[#B8935A] hover:underline text-sm">← Back to Sign In</Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <Link href="/" className="font-serif text-2xl font-semibold text-[#1A1208] dark:text-[#F0EBE2]">Hema Furniture</Link>
                <p className="text-sm text-gray-500 mt-1">Reset your password</p>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="mb-5">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email Address</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required
                    className="w-full rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A]" />
                </div>
                <button type="submit" disabled={loading || !email}
                  className="w-full bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Sending...</> : 'Send Reset Link'}
                </button>
              </form>
              <div className="mt-5 text-center">
                <Link href="/login" className="text-sm text-gray-500 hover:text-[#B8935A]">← Back to Sign In</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
