// src/app/(store)/page.tsx
import type { Metadata } from 'next';
import HomePage from '@/components/home/HomePage';

export const metadata: Metadata = {
  title: 'Hema Modern Furniture — Premium Furniture Egypt',
  description: 'Discover our curated collection of modern furniture for Egyptian homes. Free shipping over EGP 5,000.',
};

export default function Page() { return <HomePage />; }
