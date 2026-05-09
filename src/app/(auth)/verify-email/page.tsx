'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<'loading'|'success'|'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('No token provided.'); return; }
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => { if (d.success) setStatus('success'); else { setStatus('error'); setMessage(d.error); } })
      .catch(() => { setStatus('error'); setMessage('Network error.'); });
  }, [token]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl shadow-lg p-10 text-center">
          {status === 'loading' && <><div className="w-14 h-14 border-4 border-[#B8935A] border-t-transparent rounded-full animate-spin mx-auto mb-5"/><p className="text-gray-400">Verifying your email...</p></>}
          {status === 'success' && (<><div className="text-5xl mb-4">✅</div><h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-3">Email Verified!</h2><p className="text-gray-400 mb-6">Your account is now active.</p><Link href="/login" className="bg-[#B8935A] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#D4B07A] transition-colors">Sign In</Link></>)}
          {status === 'error' && (<><div className="text-5xl mb-4">❌</div><h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-3">Verification Failed</h2><p className="text-gray-400 mb-6">{message || 'Link is invalid or expired.'}</p><Link href="/login" className="text-[#B8935A] hover:underline text-sm">← Back to Sign In</Link></>)}
        </div>
      </div>
    </div>
  );
}
