'use client';
// src/... — HemaV050: constants, skeletons, error states
import { useState } from 'react';
import { apiFetch } from '@/lib/fetchWithCsrf';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { STATUS_COLOR, PAYMENT_STATUS_COLOR } from '@/lib/constants';
import { OrderCardSkeleton } from '@/components/ui/Skeleton';
import { formatEGP, formatDate } from '@/lib/utils';
import type { IOrder } from '@/types';

const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function OrdersPage() {
  const { status }       = useSession();
  const { data, error, mutate } = useSWR<{
    success: boolean;
    data: { orders: IOrder[] };
  }>('/api/v1/orders?limit=20', fetcher);

  const [retrying, setRet]   = useState<string | null>(null);
  const [iframeUrl, setIFU]  = useState<string | null>(null);

  const orders = data?.data?.orders ?? [];

  const canRetry = (o: IOrder) =>
    o.paymentMethod !== 'cod' &&
    ['failed', 'pending'].includes(o.paymentStatus) &&
    !['delivered', 'cancelled'].includes(o.status);

  const handleRetry = async (orderId: string) => {
    setRet(orderId);
    try {
      const res  = await apiFetch(`/api/v1/orders/${orderId}/retry-payment`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setIFU(json.data.iframeUrl);
        mutate();
      } else {
        toast.error(json.error ?? 'Retry failed');
      }
    } catch {
      toast.error('Network error — please try again');
    } finally {
      setRet(null);
    }
  };

  // ── Unauthenticated ───────────────────────────────────────────
  if (status === 'unauthenticated') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-center px-4">
        <div>
          <div className="text-5xl mb-4">🔐</div>
          <h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-4">
            Sign in to view your orders
          </h2>
          <Link
            href="/login?callbackUrl=/orders"
            className="inline-block bg-[#B8935A] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#D4B07A] transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904]">
      {/* Paymob retry iframe modal */}
      {iframeUrl && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-label="Secure payment window"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-[#1A1208] rounded-2xl overflow-hidden w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-[#E8DDD0] dark:border-[#2A1F14]">
              <h3 className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2]">
                🔒 Retry Payment — Paymob
              </h3>
              <button
                onClick={() => { setIFU(null); mutate(); }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                aria-label="Close payment window"
              >
                ✕
              </button>
            </div>
            <iframe
              src={iframeUrl}
              className="w-full h-[520px]"
              allow="payment"
              title="Paymob secure payment"
            />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-[#190F07] to-[#3A2010] py-14 px-6">
        <div className="max-w-[900px] mx-auto">
          <h1 className="font-serif text-4xl text-[#FAF8F5]">My Orders</h1>
          <p className="text-[#C8B898] text-sm mt-1">
            {data ? `${orders.length} order${orders.length !== 1 ? 's' : ''}` : ' '}
          </p>
        </div>
      </div>

      <div className="max-w-[900px] mx-auto px-6 py-10">
        {/* Loading skeletons */}
        {(status === 'loading' || (!data && !error)) && (
          <div className="space-y-4" aria-label="Loading orders">
            {[1, 2, 3].map(i => <OrderCardSkeleton key={i} />)}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">⚠️</div>
            <p className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2] mb-2">
              Could not load orders
            </p>
            <p className="text-gray-400 text-sm mb-6">Please check your connection and try again.</p>
            <button
              onClick={() => mutate()}
              className="bg-[#B8935A] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#D4B07A] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {data && !error && orders.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📦</div>
            <p className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-2">
              No orders yet
            </p>
            <Link href="/shop" className="text-[#B8935A] hover:underline text-sm">
              Browse the shop →
            </Link>
          </div>
        )}

        {/* Orders list */}
        {data && !error && orders.length > 0 && (
          <div className="space-y-4">
            {orders.map(o => (
              <article
                key={o._id}
                className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl overflow-hidden"
              >
                {/* Order header */}
                <div className="flex items-start justify-between p-6 flex-wrap gap-3 border-b border-[#E8DDD0]/60 dark:border-[#2A1F14]">
                  <div>
                    <div className="font-mono font-bold text-[#B8935A]">{o.orderNumber}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{formatDate(o.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR[o.status] ?? 'bg-gray-100 text-gray-600'}`}
                      aria-label={`Order status: ${o.status}`}
                    >
                      {o.status.replace(/_/g, ' ')}
                    </span>
                    <span className={`text-xs font-semibold ${PAYMENT_STATUS_COLOR[o.paymentStatus] ?? 'text-gray-400'}`}>
                      {o.paymentMethod.toUpperCase()} · {o.paymentStatus}
                    </span>
                    <span className="font-serif text-xl font-medium text-[#1A1208] dark:text-[#F0EBE2]">
                      {formatEGP(o.total)}
                    </span>
                  </div>
                </div>

                {/* Items */}
                <div className="px-6 py-4 space-y-1.5">
                  {o.items?.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">
                        {item.nameEn}
                        {' '}
                        <span className="text-gray-400">×{item.quantity}</span>
                      </span>
                      <span className="font-medium text-[#1A1208] dark:text-[#F0EBE2]">
                        {formatEGP(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="px-6 pb-5 flex items-center justify-between flex-wrap gap-3">
                  <Link
                    href={`/track/${encodeURIComponent(o.orderNumber)}`}
                    className="text-xs text-[#B8935A] hover:underline"
                  >
                    Track Order →
                  </Link>

                  {/* Retry payment */}
                  {canRetry(o) && (
                    <div className="flex items-center gap-3">
                      {o.paymentStatus === 'failed' && (
                        <span className="text-xs text-red-500 font-medium" role="alert">
                          ⚠ Payment failed
                        </span>
                      )}
                      <button
                        onClick={() => handleRetry(o._id)}
                        disabled={retrying === o._id}
                        className="flex items-center gap-2 px-4 py-2 bg-[#B8935A] hover:bg-[#D4B07A] text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        aria-label="Retry payment for this order"
                      >
                        {retrying === o._id ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Processing…
                          </>
                        ) : (
                          '🔄 Retry Payment'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
