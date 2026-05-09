// src/app/(store)/cart/page.tsx
import type { Metadata } from 'next';
import CartPage from '@/components/cart/CartPage';
export const metadata: Metadata = { title: 'Shopping Cart — Hema Furniture' };
export default function Page() { return <CartPage />; }
