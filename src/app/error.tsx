'use client';
// src/... — HemaV050: Global error boundary with Sentry reporting
import { useEffect } from 'react';
import Link from 'next/link';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('@sentry/nextjs')
        .then(Sentry => Sentry.captureException(error))
        .catch(() => {
          if (process.env.NODE_ENV !== 'production') console.error('[GlobalError]', error);
        });
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="text-7xl mb-6">😔</div>
        <h1 className="font-serif text-4xl text-[#1A1208] dark:text-[#F0EBE2] mb-3">
          Something went wrong
        </h1>
        <p className="text-gray-400 text-sm mb-8 leading-relaxed">
          An unexpected error occurred. Our team has been notified.
          {error.digest && (
            <span className="block mt-2 font-mono text-xs text-gray-300">
              Error ID: {error.digest}
            </span>
          )}
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="border border-[#E8DDD0] dark:border-[#2A1F14] text-[#1A1208] dark:text-[#F0EBE2] hover:border-[#B8935A] font-medium px-6 py-3 rounded-xl transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
