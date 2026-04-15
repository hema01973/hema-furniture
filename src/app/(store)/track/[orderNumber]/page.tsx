import type { Metadata } from 'next';
import OrderTrackingPage from '@/components/account/OrderTrackingPage';
export const metadata: Metadata = { title: 'Track Order — Hema Furniture' };
export default function Page({ params }: { params: { orderNumber: string } }) {
  return <OrderTrackingPage orderNumber={decodeURIComponent(params.orderNumber)} />;
}
