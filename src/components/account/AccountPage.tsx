'use client';
// src/... — HemaV050: constants, skeletons, a11y
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/fetchWithCsrf';
import { useSession, signOut } from 'next-auth/react';
import useSWR from 'swr';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { STATUS_COLOR } from '@/lib/constants';
import { OrderCardSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { formatEGP, formatDate } from '@/lib/utils';
import type { IOrder } from '@/types';

const fetcher = (u: string) => fetch(u).then(r => r.json());
type Tab = 'profile' | 'orders' | 'security';

// ── Change Password Form ─────────────────────────────────────────
function ChangePasswordForm() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const inp = 'w-full rounded-lg border border-[#D0C4B4] dark:border-[#3A2D20] px-3 py-2.5 text-sm bg-white dark:bg-[#0E0904] focus:outline-none focus:border-[#B8935A]';
  const submit = async () => {
    if (!form.currentPassword || !form.newPassword) return toast.error('All fields required');
    if (form.newPassword !== form.confirm) return toast.error('Passwords do not match');
    setSaving(true);
    try {
      const res  = await apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Failed');
      toast.success('Password changed successfully');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Current password</label>
        <input type="password" className={inp} value={form.currentPassword} onChange={e=>setForm(p=>({...p,currentPassword:e.target.value}))} autoComplete="current-password"/>
      </div>
      <div>
        <label className="text-xs text-gray-400 mb-1 block">New password</label>
        <input type="password" className={inp} value={form.newPassword} onChange={e=>setForm(p=>({...p,newPassword:e.target.value}))} autoComplete="new-password"/>
      </div>
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Confirm new password</label>
        <input type="password" className={inp} value={form.confirm} onChange={e=>setForm(p=>({...p,confirm:e.target.value}))} autoComplete="new-password"/>
      </div>
      <button onClick={submit} disabled={saving} className="bg-[#B8935A] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#D4B07A] transition-colors disabled:opacity-60">
        {saving ? 'Saving…' : 'Update Password'}
      </button>
    </div>
  );
}


export default function AccountPage() {
  const { data: session, status } = useSession();
  const { data: ordersData, isLoading: ordersLoading } = useSWR<{
    success: boolean; data: { orders: IOrder[] };
  }>('/api/v1/orders?limit=5', fetcher);

  const orders     = ordersData?.data?.orders ?? [];
  const [tab, setTab]     = useState<Tab>('profile');
  const [form, setForm]   = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session?.user?.name) {
      setForm(prev => ({ ...prev, name: prev.name || session.user.name }));
    }
  }, [session]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904]">
        <div className="bg-gradient-to-r from-[#190F07] to-[#3A2010] py-14 px-6">
          <div className="max-w-[900px] mx-auto">
            <Skeleton className="h-10 w-48 bg-white/10" />
            <Skeleton className="h-4 w-32 mt-2 bg-white/10" />
          </div>
        </div>
        <div className="max-w-[900px] mx-auto px-6 py-10 space-y-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-center px-4">
        <div>
          <div className="text-5xl mb-4">🔐</div>
          <h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-4">Please sign in</h2>
          <Link href="/login?callbackUrl=/account" className="inline-block bg-[#B8935A] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#D4B07A] transition-colors">Sign In</Link>
        </div>
      </div>
    );
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || form.name.length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }
    setSaving(true);
    try {
      const res  = await apiFetch(`/api/v1/users/${session!.user.id}`, {
        method:  'PUT',
        body:    JSON.stringify({ name: form.name.trim(), phone: form.phone.trim() }),
      });
      const data = await res.json();
      if (data.success) toast.success('Profile updated!');
      else              toast.error(data.error ?? 'Update failed');
    } catch { toast.error('Network error'); }
    setSaving(false);
  };

  const tabClass = (t: Tab) =>
    `px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
      tab === t
        ? 'bg-[#B8935A] text-white'
        : 'bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] text-gray-500 hover:border-[#B8935A]'
    }`;

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904]">
      <div className="bg-gradient-to-r from-[#190F07] to-[#3A2010] py-14 px-6">
        <div className="max-w-[900px] mx-auto">
          <h1 className="font-serif text-4xl text-[#FAF8F5]">My Account</h1>
          <p className="text-[#C8B898] text-sm mt-1">{session?.user?.email}</p>
        </div>
      </div>

      <div className="max-w-[900px] mx-auto px-6 py-10">
        {/* Tab navigation */}
        <nav className="flex gap-2 mb-8 flex-wrap" aria-label="Account sections">
          <button onClick={() => setTab('profile')}  className={tabClass('profile')}>👤 Profile</button>
          <button onClick={() => setTab('orders')}   className={tabClass('orders')}>📦 Orders</button>
          <button onClick={() => setTab('security')} className={tabClass('security')}>🔐 Security</button>
        </nav>

        {/* Profile tab */}
        {tab === 'profile' && (
          <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6">
            <h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-5">Profile Information</h2>
            <form onSubmit={saveProfile} noValidate>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="name" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="name" type="text" value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    autoComplete="name" required
                    className="w-full rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A] focus:ring-2 focus:ring-[#B8935A]/10 transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone Number</label>
                  <input
                    id="phone" type="tel" value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+20 1XX XXX XXXX" autoComplete="tel"
                    className="w-full rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A] focus:ring-2 focus:ring-[#B8935A]/10 transition-all"
                  />
                </div>
              </div>
              <div className="mb-5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email Address</label>
                <input
                  type="email" value={session?.user?.email ?? ''} disabled
                  aria-readonly="true"
                  className="w-full rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#F2EDE6] dark:bg-[#1A1208] text-gray-400 cursor-not-allowed"
                />
                <p className="text-xs text-gray-400 mt-1">Email cannot be changed.</p>
              </div>
              <button
                type="submit" disabled={saving}
                className="bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold px-6 py-3 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</> : 'Save Changes'}
              </button>
            </form>
          </div>
        )}

        {/* Orders tab */}
        {tab === 'orders' && (
          <div className="space-y-4">
            {ordersLoading && [1,2,3].map(i => <OrderCardSkeleton key={i} />)}
            {!ordersLoading && orders.length === 0 && (
              <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-10 text-center">
                <div className="text-5xl mb-3">📦</div>
                <p className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2] mb-2">No orders yet</p>
                <Link href="/shop" className="text-[#B8935A] hover:underline text-sm">Browse the shop →</Link>
              </div>
            )}
            {orders.map(o => (
              <article key={o._id} className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6">
                <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <div className="font-mono font-bold text-[#B8935A]">{o.orderNumber}</div>
                    <div className="text-xs text-gray-400">{formatDate(o.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR[o.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {o.status.replace(/_/g,' ')}
                    </span>
                    <span className="font-serif text-lg font-medium text-[#1A1208] dark:text-[#F0EBE2]">
                      {formatEGP(o.total)}
                    </span>
                  </div>
                </div>
                <div className="space-y-1 mb-3">
                  {o.items?.map((item,i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">{item.nameEn} <span className="text-gray-400">×{item.quantity}</span></span>
                      <span className="font-medium text-[#1A1208] dark:text-[#F0EBE2]">{formatEGP(item.price*item.quantity)}</span>
                    </div>
                  ))}
                </div>
                <Link href={`/track/${encodeURIComponent(o.orderNumber)}`} className="text-xs text-[#B8935A] hover:underline">Track Order →</Link>
              </article>
            ))}
            {orders.length > 0 && (
              <div className="text-center">
                <Link href="/orders" className="text-[#B8935A] hover:underline text-sm">View all orders →</Link>
              </div>
            )}
          </div>
        )}

        {/* Security tab */}
        {tab === 'security' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6">
              <h3 className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2] mb-4">Change Password</h3>
              <ChangePasswordForm />
            </div>
            <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6">
              <h3 className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2] mb-2">Sign Out</h3>
              <p className="text-sm text-gray-400 mb-4">Sign out from all active sessions.</p>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
