'use client';
// src/app/admin/users/page.tsx
import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface User {
  _id: string; name: string; email: string; phone?: string;
  role: string; isActive: boolean; createdAt: string;
  wishlist?: string[]; addresses?: unknown[];
}

export default function AdminUsers() {
  const [page, setPage] = useState(1);
  const [q, setQ]       = useState('');
  const [roleF, setRoleF] = useState('');

  const queryStr = new URLSearchParams({ page: String(page), limit: '20', ...(q ? { q } : {}), ...(roleF ? { role: roleF } : {}) }).toString();
  const { data, mutate } = useSWR<{ success: boolean; data: { users: User[]; pagination: { total: number; pages: number } } }>(
    `/api/users?${queryStr}`, fetcher
  );

  const users      = data?.data?.users ?? [];
  const pagination = data?.data?.pagination;

  const toggleBlock = async (user: User) => {
    const action = user.isActive ? 'block' : 'unblock';
    const res    = await fetch(`/api/users/${user._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    const json   = await res.json();
    if (json.success) { toast.success(`User ${action}ed`); mutate(); }
    else              toast.error(json.error || 'Action failed');
  };

  const deleteUser = async (user: User) => {
    if (!confirm(`Delete user ${user.name}? This cannot be undone.`)) return;
    const res  = await fetch(`/api/users/${user._id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { toast.success('User deleted'); mutate(); }
    else              toast.error(json.error || 'Delete failed');
  };

  return (
    <div>
      <h1 className="text-4xl font-serif text-[#1A1208] dark:text-[#F0EBE2] mb-6">Customers</h1>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          type="text" placeholder="Search name or email..." value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          className="flex-1 min-w-[200px] rounded-lg border border-[#D0C4B4] dark:border-[#3A2D20] px-3 py-2 text-sm bg-white dark:bg-[#1A1208] focus:outline-none focus:border-[#B8935A]"
        />
        <select value={roleF} onChange={e => { setRoleF(e.target.value); setPage(1); }}
          className="rounded-lg border border-[#D0C4B4] dark:border-[#3A2D20] px-3 py-2 text-sm bg-white dark:bg-[#1A1208] focus:outline-none focus:border-[#B8935A]">
          <option value="">All Roles</option>
          <option value="customer">Customer</option>
          <option value="admin">Admin</option>
          <option value="staff">Staff</option>
        </select>
        <span className="self-center text-sm text-gray-400">{pagination?.total ?? 0} total</span>
      </div>

      <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F2EDE6]/60 dark:bg-white/5">
                {['User','Email','Phone','Role','Status','Joined','Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No users found</td></tr>}
              {users.map(u => (
                <tr key={u._id} className="border-t border-[#E8DDD0]/50 dark:border-[#2A1F14] hover:bg-[#F2EDE6]/30 dark:hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#B8935A] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {u.name[0]?.toUpperCase()}
                      </div>
                      <div className="font-medium text-sm text-[#1A1208] dark:text-[#F0EBE2]">{u.name}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-[180px] truncate">{u.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{u.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${u.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : u.role === 'staff' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${u.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                      {u.isActive ? 'Active' : 'Blocked'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {new Date(u.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => toggleBlock(u)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${u.isActive ? 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100' : 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100'}`}>
                        {u.isActive ? 'Block' : 'Unblock'}
                      </button>
                      {u.role !== 'admin' && (
                        <button onClick={() => deleteUser(u)} className="px-2 py-1 bg-red-50 border border-red-200 rounded text-xs font-medium text-red-600 hover:bg-red-100 transition-colors">Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination && pagination.pages > 1 && (
          <div className="px-4 py-3 border-t border-[#E8DDD0] dark:border-[#2A1F14] flex items-center justify-between">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40 hover:bg-[#F2EDE6] transition-colors">← Prev</button>
            <span className="text-sm text-gray-500">Page {page} of {pagination.pages}</span>
            <button onClick={() => setPage(p => Math.min(pagination.pages, p+1))} disabled={page === pagination.pages} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40 hover:bg-[#F2EDE6] transition-colors">Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
