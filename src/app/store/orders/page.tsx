// src/app/(store)/orders/page.tsx
import type { Metadata } from 'next';
import OrdersPage from '@/components/account/OrdersPage';
export const metadata: Metadata = { title: 'My Orders — Hema Furniture' };
export default function Page() { return <OrdersPage />; }
