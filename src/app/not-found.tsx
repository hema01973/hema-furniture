// src/app/not-found.tsx — Custom 404
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '404 — Page Not Found | Hema Furniture' };

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="font-serif text-9xl text-[#B8935A] font-light mb-4">404</div>
        <h1 className="font-serif text-3xl text-[#1A1208] dark:text-[#F0EBE2] mb-3">
          Page not found
        </h1>
        <p className="text-gray-400 text-sm mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/"
            className="bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Back to Home
          </Link>
          <Link
            href="/shop"
            className="border border-[#E8DDD0] dark:border-[#2A1F14] text-[#1A1208] dark:text-[#F0EBE2] hover:border-[#B8935A] font-medium px-6 py-3 rounded-xl transition-colors"
          >
            Browse Shop
          </Link>
        </div>
      </div>
    </div>
  );
}
