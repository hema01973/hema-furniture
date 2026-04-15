'use client';
// src/components/account/OrderTrackingPage.tsx
import useSWR from 'swr';
import Link from 'next/link';
import type { IOrder } from '@/types';

const fetcher = (u: string) => fetch(u).then(r => r.json());

const STEPS = [
  { key: 'pending',          label: 'Order Placed',     icon: '🧾' },
  { key: 'confirmed',        label: 'Confirmed',         icon: '✅' },
  { key: 'processing',       label: 'Processing',        icon: '⚙️' },
  { key: 'shipped',          label: 'Shipped',           icon: '🚚' },
  { key: 'out_for_delivery', label: 'Out for Delivery',  icon: '🏠' },
  { key: 'delivered',        label: 'Delivered',         icon: '🎉' },
];

function stepIndex(status: string): number {
  if (status === 'cancelled') return -1;
  return STEPS.findIndex(s => s.key === status);
}

export default function OrderTrackingPage({ orderNumber }: { orderNumber: string }) {
  const { data, isLoading } = useSWR<{ success: boolean; data: { orders: IOrder[] } }>(
    '/api/orders?limit=50', fetcher
  );
  const order = data?.data?.orders?.find(o => o.orderNumber === orderNumber);
  const idx   = order ? stepIndex(order.status) : -1;

  if (isLoading) return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[#B8935A] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904]">
      <div className="bg-gradient-to-r from-[#190F07] to-[#3A2010] py-14 px-6">
        <div className="max-w-[800px] mx-auto">
          <h1 className="font-serif text-4xl text-[#FAF8F5]">Track Order</h1>
          <p className="text-[#C8B898] font-mono text-sm mt-1">{orderNumber}</p>
        </div>
      </div>

      <div className="max-w-[800px] mx-auto px-6 py-10">
        {!order ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-3">Order Not Found</h2>
            <p className="text-gray-400 mb-6">We couldn&apos;t find <strong>{orderNumber}</strong></p>
            <Link href="/orders" className="text-[#B8935A] hover:underline">View my orders →</Link>
          </div>
        ) : (
          <>
            {order.status === 'cancelled' ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 mb-6 text-center">
                <div className="text-4xl mb-2">❌</div>
                <div className="font-serif text-xl text-red-700 dark:text-red-300">Order Cancelled</div>
              </div>
            ) : (
              <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-8 mb-6">
                {/* Progress bar */}
                <div className="relative mb-8">
                  <div className="absolute top-5 left-0 right-0 h-1 bg-[#E8DDD0] dark:bg-[#2A1F14]">
                    <div className="h-full bg-[#B8935A] transition-all duration-700"
                      style={{ width: idx >= 0 ? `${(idx/(STEPS.length-1))*100}%` : '0%' }} />
                  </div>
                  <div className="relative flex justify-between">
                    {STEPS.map((step, i) => {
                      const done    = i < idx;
                      const current = i === idx;
                      return (
                        <div key={step.key} className="flex flex-col items-center">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base border-2 z-10 transition-all ${
                            done    ? 'bg-[#B8935A] border-[#B8935A] text-white' :
                            current ? 'border-[#B8935A] text-[#B8935A] bg-white dark:bg-[#1A1208]' :
                                      'border-[#E8DDD0] dark:border-[#2A1F14] text-gray-300 bg-white dark:bg-[#1A1208]'
                          }`}>
                            {done ? '✓' : step.icon}
                          </div>
                          <div className={`text-[10px] mt-2 text-center max-w-[60px] leading-tight hidden sm:block ${
                            current ? 'text-[#B8935A] font-semibold' : done ? 'text-gray-500' : 'text-gray-300'
                          }`}>{step.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-[#F2EDE6] dark:bg-white/5 rounded-xl p-4 text-center">
                  <div className="text-2xl mb-1">{STEPS[idx]?.icon ?? '📦'}</div>
                  <div className="font-serif text-lg text-[#1A1208] dark:text-[#F0EBE2]">{STEPS[idx]?.label ?? order.status}</div>
                  {order.estimatedDelivery && (
                    <div className="text-xs text-gray-400 mt-1">
                      Est. delivery: {new Date(order.estimatedDelivery).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })}
                    </div>
                  )}
                  {order.trackingNumber && (
                    <div className="mt-2 text-xs text-[#B8935A] font-mono">
                      Tracking: {order.trackingUrl
                        ? <a href={order.trackingUrl} target="_blank" rel="noopener" className="hover:underline">{order.trackingNumber}</a>
                        : order.trackingNumber}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Status history */}
            {Array.isArray(order.statusHistory) && order.statusHistory.length > 0 && (
              <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6 mb-6">
                <h3 className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2] mb-4">Status History</h3>
                <div className="space-y-3">
                  {[...order.statusHistory].reverse().map((h, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#B8935A] mt-1.5 flex-shrink-0" />
                      <div>
                        <span className="text-sm font-medium text-[#1A1208] dark:text-[#F0EBE2] capitalize">{h.status?.replace(/_/g,' ')}</span>
                        {h.note && <span className="text-xs text-gray-400 ml-2">{h.note}</span>}
                        <div className="text-xs text-gray-400">{new Date(h.timestamp).toLocaleString('en-GB')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Order details */}
            <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6">
              <h3 className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2] mb-4">Order Details</h3>
              {order.items?.map((item, i) => (
                <div key={i} className="flex justify-between py-2 border-b border-[#E8DDD0]/50 dark:border-[#2A1F14] last:border-0 text-sm">
                  <span className="text-[#1A1208] dark:text-[#F0EBE2]">{item.nameEn} <span className="text-gray-400">×{item.quantity}</span></span>
                  <span className="font-medium text-[#B8935A]">EGP {(item.price*item.quantity).toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold mt-4 pt-4 border-t border-[#E8DDD0] dark:border-[#2A1F14]">
                <span className="text-[#1A1208] dark:text-[#F0EBE2]">Total</span>
                <span className="font-serif text-xl text-[#B8935A]">EGP {order.total?.toLocaleString()}</span>
              </div>
            </div>

            <div className="mt-6 text-center">
              <Link href="/orders" className="text-[#B8935A] hover:underline text-sm">← All Orders</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
