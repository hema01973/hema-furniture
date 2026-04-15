'use client';
// src/components/account/AccountPage.tsx
import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import Link from 'next/link';
import type { IOrder } from '@/types';

const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function AccountPage() {
  const { data: session, status } = useSession();
  const { data: ordersData }      = useSWR<{ success: boolean; data: { orders: IOrder[] } }>('/api/orders?limit=5', fetcher);
  const orders = ordersData?.data?.orders ?? [];

  const [activeTab, setTab] = useState<'profile'|'orders'|'security'>('profile');
  const [form, setForm]     = useState({ name: session?.user?.name ?? '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);

  if (status === 'loading') return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[#B8935A] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (status === 'unauthenticated') return (
    <div className="min-h-[60vh] flex items-center justify-center text-center px-4">
      <div><h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-4">Please sign in</h2>
        <Link href="/login?callbackUrl=/account" className="bg-[#B8935A] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#D4B07A] transition-colors">Sign In</Link>
      </div>
    </div>
  );

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res  = await fetch(`/api/users/${session!.user.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.success) toast.success('Profile updated!');
      else              toast.error(data.error ?? 'Failed');
    } catch { toast.error('Network error'); }
    setSaving(false);
  };

  const resendVerification = async () => {
    setResending(true);
    try {
      const res  = await fetch('/api/auth/verify-email', { method: 'POST' });
      const data = await res.json();
      if (data.success) toast.success('Verification email sent!');
      else              toast.error(data.error ?? 'Failed');
    } catch { toast.error('Network error'); }
    setResending(false);
  };

  const STATUS_COLOR: Record<string, string> = {
    pending:   'bg-amber-100 text-amber-700',
    confirmed: 'bg-blue-100 text-blue-700',
    shipped:   'bg-indigo-100 text-indigo-700',
    delivered: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904]">
      <div className="bg-gradient-to-r from-[#190F07] to-[#3A2010] py-14 px-6">
        <div className="max-w-[900px] mx-auto">
          <h1 className="font-serif text-4xl text-[#FAF8F5]">My Account</h1>
          <p className="text-[#C8B898] text-sm mt-1">{session?.user?.email}</p>
        </div>
      </div>

      <div className="max-w-[900px] mx-auto px-6 py-10">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {(['profile','orders','security'] as const).map(tab => (
            <button key={tab} onClick={() => setTab(tab)}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium capitalize transition-colors ${activeTab===tab ? 'bg-[#B8935A] text-white' : 'bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] text-gray-500 hover:border-[#B8935A]'}`}>
              {tab === 'profile' ? '👤 Profile' : tab === 'orders' ? '📦 Orders' : '🔐 Security'}
            </button>
          ))}
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6">
            <h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-5">Profile Information</h2>
            <form onSubmit={saveProfile}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Full Name</label>
                  <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone Number</label>
                  <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+20 1XX XXX XXXX"
                    className="w-full rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A]" />
                </div>
              </div>
              <div className="mb-5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email</label>
                <div className="flex items-center gap-3">
                  <input type="email" value={session!.user.email} disabled
                    className="flex-1 rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#F2EDE6] dark:bg-[#1A1208] text-gray-400 cursor-not-allowed" />
                </div>
              </div>
              <button type="submit" disabled={saving}
                className="bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold px-6 py-3 rounded-xl transition-colors disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {orders.length === 0 ? (
              <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-10 text-center">
                <div className="text-5xl mb-3">📦</div>
                <p className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2] mb-2">No orders yet</p>
                <Link href="/shop" className="text-[#B8935A] hover:underline">Browse the shop →</Link>
              </div>
            ) : orders.map(o => (
              <div key={o._id} className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6">
                <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <div className="font-mono font-bold text-[#B8935A]">{o.orderNumber}</div>
                    <div className="text-xs text-gray-400">{new Date(o.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR[o.status] ?? 'bg-gray-100 text-gray-600'}`}>{o.status}</span>
                    <span className="font-serif text-lg text-[#1A1208] dark:text-[#F0EBE2]">EGP {o.total?.toLocaleString()}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  {o.items?.slice(0,3).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">{item.nameEn} <span className="text-gray-400">×{item.quantity}</span></span>
                      <span className="font-medium text-[#1A1208] dark:text-[#F0EBE2]">EGP {(item.price*item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {orders.length > 0 && (
              <div className="text-center">
                <Link href="/orders" className="text-[#B8935A] hover:underline text-sm">View all orders →</Link>
              </div>
            )}
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6">
              <h3 className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2] mb-4">Password</h3>
              <p className="text-sm text-gray-400 mb-4">To change your password, use the password reset flow.</p>
              <Link href="/forgot-password" className="inline-block border border-[#E8DDD0] dark:border-[#2A1F14] text-[#1A1208] dark:text-[#F0EBE2] hover:border-[#B8935A] hover:text-[#B8935A] font-medium px-5 py-2.5 rounded-xl transition-colors text-sm">
                Change Password
              </Link>
            </div>
            <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6">
              <h3 className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2] mb-2">Sign Out</h3>
              <p className="text-sm text-gray-400 mb-4">Sign out from all devices.</p>
              <button onClick={() => signOut({ callbackUrl: '/' })}
                className="border border-red-200 text-red-500 hover:bg-red-50 font-medium px-5 py-2.5 rounded-xl transition-colors text-sm">
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
