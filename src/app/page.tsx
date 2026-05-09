// src/app/page.tsx — Hema V027: root page uses HomePage component
import { Suspense } from 'react';
import type { Metadata } from 'next';
import HomePage from '@/components/home/HomePage';

export const metadata: Metadata = {
  title: 'Hema Modern Furniture — Premium Egyptian Furniture',
  description: 'Discover premium modern furniture for Egyptian homes. Shop living room, bedroom, dining, and office collections.',
};

export default function Page() {
  return (
    <Suspense fallback={<div className="h-screen animate-pulse bg-[#FAF8F5] dark:bg-[#0E0904]" />}>
      <HomePage />
    </Suspense>
  );
}
