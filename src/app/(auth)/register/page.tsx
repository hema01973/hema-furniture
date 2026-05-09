'use client';
// src/app/(auth)/register/page.tsx
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm]       = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);
  const [errors, setErrors]   = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name || form.name.length < 2)          e.name     = 'Name must be at least 2 characters';
    if (!form.email || !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Valid email required';
    if (!form.password || form.password.length < 8)  e.password = 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(form.password))                e.password = 'Must include an uppercase letter';
    if (!/[0-9]/.test(form.password))                e.password = 'Must include a number';
    if (form.password !== form.confirm)              e.confirm  = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: form.name, email: form.email, password: form.password, phone: form.phone }),
      });
      const data = await res.json();
      if (!data.success) { toast.error(data.error || 'Registration failed'); setLoading(false); return; }
      // Auto sign-in after registration
      const signInRes = await signIn('credentials', { email: form.email, password: form.password, redirect: false });
      if (signInRes?.ok) { toast.success('Account created! Welcome to Hema Furniture 🎉'); router.replace('/'); }
      else               { toast.success('Account created! Please sign in.'); router.replace('/login'); }
    } catch {
      toast.error('Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  const field = (key: keyof typeof form, label: string, type = 'text', ph = '') => (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
      <input
        type={key === 'password' || key === 'confirm' ? (showPw ? 'text' : 'password') : type}
        value={form[key]}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        placeholder={ph}
        autoComplete={key === 'email' ? 'email' : key === 'password' ? 'new-password' : key}
        className={`w-full rounded-lg border px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A] focus:ring-2 focus:ring-[#B8935A]/10 transition-all ${errors[key] ? 'border-red-400' : 'border-[#D0C4B4] dark:border-[#3A2D20]'}`}
      />
      {errors[key] && <p className="text-xs text-red-500 mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <Link href="/" className="font-serif text-2xl font-semibold text-[#1A1208] dark:text-[#F0EBE2]">Hema Modern Furniture</Link>
            <p className="text-sm text-gray-500 mt-1">Create your account</p>
          </div>
          <form onSubmit={handleSubmit} noValidate>
            {field('name', 'Full Name', 'text', 'Mohamed Ahmed')}
            {field('email', 'Email Address', 'email', 'you@example.com')}
            {field('phone', 'Phone Number', 'tel', '+20 1XX XXX XXXX')}
            {field('password', 'Password', 'password', '••••••••')}
            {field('confirm', 'Confirm Password', 'password', '••••••••')}
            <div className="mb-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} className="w-4 h-4 accent-[#B8935A]" />
                <span className="text-sm text-gray-500">Show passwords</span>
              </label>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Creating account...</> : 'Create Account'}
            </button>
          </form>
          <div className="mt-6 pt-6 border-t border-[#E8DDD0] dark:border-[#2A1F14] text-center">
            <p className="text-sm text-gray-500">Already have an account?{' '}
              <Link href="/login" className="text-[#B8935A] font-semibold hover:underline">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
