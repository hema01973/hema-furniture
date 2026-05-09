// src/app/(store)/checkout/page.tsx
import type { Metadata } from 'next';
import CheckoutPage from '@/components/checkout/CheckoutPage';
export const metadata: Metadata = { title: 'Checkout — Hema Furniture' };
export default function Page() { return <CheckoutPage />; }
