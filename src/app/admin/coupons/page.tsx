'use client';
// src/app/admin/coupons/page.tsx — Hema V027: admin coupon CRUD
import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import toast from 'react-hot-toast';
import { apiFetch } from '@/lib/fetchWithCsrf';
import { formatEGP, formatDate } from '@/lib/utils';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface ICoupon {
  _id: string; code: string; type: 'percentage' | 'fixed';
  value: number; minOrderValue: number; maxUses?: number;
  usedCount: number; expiresAt?: string; isActive: boolean;
  createdAt: string;
}

type CouponForm = {
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minOrderValue: number;
  maxUses: string;
  expiresAt: string;
  isActive: boolean;
};

const empty: CouponForm = { code: '', type: 'percentage', value: 10, minOrderValue: 0, maxUses: '', expiresAt: '', isActive: true };

export default function AdminCouponsPage() {
  const { data, isLoading } = useSWR<{ success: boolean; data: { coupons: ICoupon[] } }>('/api/v1/admin/coupons', fetcher);
  const coupons = data?.data?.coupons ?? [];
  const [form, setForm]       = useState<CouponForm>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);

  const reset = () => { setForm(empty); setEditing(null); };

  const save = async () => {
    if (!form.code.trim()) return toast.error('Coupon code required');
    setSaving(true);
    try {
      const body = {
        ...form,
        code:    form.code.toUpperCase().trim(),
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        expiresAt: form.expiresAt || undefined,
      };
      const res  = await apiFetch(editing ? `/api/v1/admin/coupons/${editing}` : '/api/v1/admin/coupons', {
        method: editing ? 'PUT' : 'POST',
        body:   JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(editing ? 'Coupon updated' : 'Coupon created');
      mutate('/api/v1/admin/coupons');
      reset();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (id: string, isActive: boolean) => {
    const res  = await apiFetch(`/api/v1/admin/coupons/${id}`, { method: 'PUT', body: JSON.stringify({ isActive: !isActive }) });
    const json = await res.json();
    if (json.success) { toast.success(isActive ? 'Deactivated' : 'Activated'); mutate('/api/v1/admin/coupons'); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this coupon?')) return;
    const res  = await apiFetch(`/api/v1/admin/coupons/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { toast.success('Deleted'); mutate('/api/v1/admin/coupons'); }
  };

  const startEdit = (c: ICoupon) => {
    setEditing(c._id);
    setForm({ code: c.code, type: c.type, value: c.value, minOrderValue: c.minOrderValue, maxUses: c.maxUses ? String(c.maxUses) : '', expiresAt: c.expiresAt ? (c.expiresAt.split('T')[0] ?? '') : '', isActive: c.isActive });
  };

  const inp = 'w-full rounded-lg border border-[#D0C4B4] dark:border-[#3A2D20] px-3 py-2 text-sm bg-white dark:bg-[#1A1208] focus:outline-none focus:border-[#B8935A]';
  const btn = 'px-4 py-2 rounded-lg text-sm font-semibold transition-colors';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl text-[#1A1208] dark:text-[#F0EBE2]">Coupons</h1>
          <p className="text-sm text-gray-400 mt-1">{coupons.length} coupons total</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6 mb-6">
        <h2 className="font-semibold text-sm text-[#1A1208] dark:text-[#F0EBE2] mb-4">{editing ? 'Edit Coupon' : 'New Coupon'}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Code *</label>
            <input className={inp} value={form.code} onChange={e=>setForm(p=>({...p,code:e.target.value.toUpperCase()}))} placeholder="SAVE20"/>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Type</label>
            <select className={inp} value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value as 'percentage'|'fixed'}))}>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed (EGP)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Value *</label>
            <input className={inp} type="number" min={1} value={form.value} onChange={e=>setForm(p=>({...p,value:+e.target.value}))} placeholder={form.type==='percentage'?'10':'500'}/>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Min order (EGP)</label>
            <input className={inp} type="number" min={0} value={form.minOrderValue} onChange={e=>setForm(p=>({...p,minOrderValue:+e.target.value}))}/>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Max uses (blank = unlimited)</label>
            <input className={inp} type="number" min={1} value={form.maxUses} onChange={e=>setForm(p=>({...p,maxUses:e.target.value}))} placeholder="100"/>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Expires (optional)</label>
            <input className={inp} type="date" value={form.expiresAt} onChange={e=>setForm(p=>({...p,expiresAt:e.target.value}))}/>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={save} disabled={saving} className={`${btn} bg-[#B8935A] text-white hover:bg-[#D4B07A] disabled:opacity-60`}>
            {saving ? 'Saving…' : editing ? 'Update Coupon' : 'Create Coupon'}
          </button>
          {editing && <button onClick={reset} className={`${btn} border border-[#D0C4B4] text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5`}>Cancel</button>}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-10 text-gray-400">Loading…</div>
      ) : coupons.length === 0 ? (
        <div className="text-center py-10 text-gray-400">No coupons yet</div>
      ) : (
        <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F2EDE6] dark:bg-white/5">
              <tr>
                {['Code','Type','Value','Min Order','Uses','Expires','Status',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.map((c, i) => (
                <tr key={c._id} className={`border-t border-[#E8DDD0] dark:border-[#2A1F14] ${i%2===0?'':'bg-[#FAF8F5] dark:bg-white/[0.02]'}`}>
                  <td className="px-4 py-3 font-mono font-semibold text-[#B8935A]">{c.code}</td>
                  <td className="px-4 py-3 capitalize">{c.type}</td>
                  <td className="px-4 py-3 font-semibold">{c.type==='percentage'?`${c.value}%`:formatEGP(c.value)}</td>
                  <td className="px-4 py-3">{c.minOrderValue ? formatEGP(c.minOrderValue) : '—'}</td>
                  <td className="px-4 py-3">{c.usedCount}{c.maxUses ? `/${c.maxUses}` : ''}</td>
                  <td className="px-4 py-3">{c.expiresAt ? formatDate(c.expiresAt) : '∞'}</td>
                  <td className="px-4 py-3">
                    <button onClick={()=>toggle(c._id,c.isActive)} className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.isActive?'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300':'bg-gray-100 text-gray-500 dark:bg-white/10'}`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={()=>startEdit(c)} className="text-xs text-[#B8935A] hover:underline">Edit</button>
                      <button onClick={()=>remove(c._id)} className="text-xs text-red-400 hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
