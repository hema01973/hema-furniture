'use client';
// src/app/admin/orders/page.tsx
import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import type { IOrder, OrderStatus } from '@/types';

const fetcher = (u: string) => fetch(u).then(r => r.json());

const STATUS_OPTIONS: OrderStatus[] = ['pending','confirmed','processing','shipped','delivered','cancelled'];
const STATUS_COLOR: Record<OrderStatus, string> = {
  pending:    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  confirmed:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  processing: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  shipped:    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  delivered:  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelled:  'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export default function AdminOrders() {
  const [page, setPage]           = useState(1);
  const [statusF, setStatusF]     = useState('all');
  const [detail, setDetail]       = useState<IOrder | null>(null);

  const { data, mutate } = useSWR<{ success: boolean; data: { orders: IOrder[]; pagination: { total: number; pages: number } } }>(
    `/api/orders?page=${page}&limit=20${statusF !== 'all' ? `&status=${statusF}` : ''}`,
    fetcher
  );

  const orders     = data?.data?.orders ?? [];
  const pagination = data?.data?.pagination;

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    const res  = await fetch(`/api/orders/${orderId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const json = await res.json();
    if (json.success) { toast.success(`Status updated to ${status}`); mutate(); if (detail?._id === orderId) setDetail({ ...detail, status }); }
    else              toast.error(json.error || 'Update failed');
  };

  return (
    <div>
      <h1 className="text-4xl font-serif text-[#1A1208] dark:text-[#F0EBE2] mb-6">Orders</h1>

      {/* Filters */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {['all', ...STATUS_OPTIONS].map(s => (
          <button key={s} onClick={() => { setStatusF(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${statusF === s ? 'bg-[#B8935A] text-white' : 'bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] text-gray-500 hover:border-[#B8935A]'}`}>
            {s}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-400 self-center">{pagination?.total ?? 0} total orders</span>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F2EDE6]/60 dark:bg-white/5">
                {['Order','Customer','Items','Total','Payment','Status','Date','Action'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No orders found</td></tr>
              )}
              {orders.map(o => (
                <tr key={o._id} className="border-t border-[#E8DDD0]/50 dark:border-[#2A1F14] hover:bg-[#F2EDE6]/30 dark:hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3">
                    <button onClick={() => setDetail(o)} className="font-bold text-sm text-[#B8935A] hover:underline">{o.orderNumber}</button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-[#1A1208] dark:text-[#F0EBE2]">{o.customer?.firstName} {o.customer?.lastName}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[140px]">{o.customer?.email}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{o.items?.length} item(s)</td>
                  <td className="px-4 py-3 font-bold text-sm text-[#B8935A]">EGP {o.total?.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${o.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {o.paymentMethod?.toUpperCase()} · {o.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={o.status}
                      onChange={e => updateStatus(o._id, e.target.value as OrderStatus)}
                      className={`text-xs px-2 py-1 rounded-full font-semibold border-0 cursor-pointer ${STATUS_COLOR[o.status]}`}
                      style={{ background: 'transparent' }}
                    >
                      {STATUS_OPTIONS.map(s => <option key={s} value={s} className="bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200">{s}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {new Date(o.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setDetail(o)} className="text-xs px-3 py-1 bg-[#F2EDE6] dark:bg-white/10 rounded-lg hover:bg-[#E8DDD0] transition-colors">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="px-4 py-3 border-t border-[#E8DDD0] dark:border-[#2A1F14] flex items-center justify-between">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40 hover:bg-[#F2EDE6] transition-colors">← Prev</button>
            <span className="text-sm text-gray-500">Page {page} of {pagination.pages}</span>
            <button onClick={() => setPage(p => Math.min(pagination.pages, p+1))} disabled={page === pagination.pages} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40 hover:bg-[#F2EDE6] transition-colors">Next →</button>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-[#1A1208] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-[#E8DDD0] dark:border-[#2A1F14] flex justify-between items-center">
              <h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2]">{detail.orderNumber}</h2>
              <button onClick={() => setDetail(null)} className="text-2xl text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Customer</div>
                  <div className="text-sm font-medium text-[#1A1208] dark:text-[#F0EBE2]">{detail.customer?.firstName} {detail.customer?.lastName}</div>
                  <div className="text-xs text-gray-400">{detail.customer?.email}</div>
                  <div className="text-xs text-gray-400">{detail.customer?.phone}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Shipping Address</div>
                  <div className="text-sm text-[#1A1208] dark:text-[#F0EBE2]">{detail.shippingAddress?.street}</div>
                  <div className="text-xs text-gray-400">{detail.shippingAddress?.city}, {detail.shippingAddress?.governorate}</div>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Items</div>
                {detail.items?.map((item, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-[#E8DDD0]/50 dark:border-[#2A1F14] last:border-0">
                    <div className="text-sm text-[#1A1208] dark:text-[#F0EBE2]">{item.nameEn} <span className="text-gray-400">×{item.quantity}</span></div>
                    <div className="text-sm font-semibold text-[#B8935A]">EGP {(item.price * item.quantity).toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <div className="bg-[#F2EDE6] dark:bg-white/5 rounded-xl p-4">
                <div className="flex justify-between text-sm mb-1"><span className="text-gray-500">Subtotal</span><span>EGP {detail.subtotal?.toLocaleString()}</span></div>
                {(detail.discount ?? 0) > 0 && <div className="flex justify-between text-sm mb-1"><span className="text-green-600">Discount</span><span className="text-green-600">-EGP {detail.discount?.toLocaleString()}</span></div>}
                <div className="flex justify-between text-sm mb-1"><span className="text-gray-500">Shipping</span><span>{detail.shipping === 0 ? 'Free' : `EGP ${detail.shipping}`}</span></div>
                <div className="flex justify-between font-bold text-base border-t border-[#E8DDD0] dark:border-[#2A1F14] pt-2 mt-2">
                  <span>Total</span><span className="text-[#B8935A]">EGP {detail.total?.toLocaleString()}</span>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Update Status</div>
                <div className="flex gap-2 flex-wrap">
                  {STATUS_OPTIONS.map(s => (
                    <button key={s} onClick={() => updateStatus(detail._id, s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${detail.status === s ? 'bg-[#B8935A] text-white' : 'bg-[#F2EDE6] dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-[#E8DDD0]'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
