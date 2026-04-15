// src/app/(store)/shop/page.tsx
import type { Metadata } from 'next';
import ShopPage from '@/components/shop/ShopPage';

export const metadata: Metadata = {
  title: 'Shop — Hema Modern Furniture',
  description: 'Browse our full collection of premium furniture. Living room, bedroom, dining, office and outdoor.',
};

export default function Page() { return <ShopPage />; }
