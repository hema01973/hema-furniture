'use client';
// src/app/admin/users/page.tsx — HemaV055: role management UI added
//
// V055 NEW: Role grant/revoke buttons added to each user row.
// Admins can now assign/remove roles (admin, moderator, user) directly from the UI.

import { useState } from 'react';
import { apiFetch } from '@/lib/fetchWithCsrf';
import useSWR from 'swr';
import toast from 'react-hot-toast';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface User {
  _id: string; name: string; email: string; phone?: string;
  role: string; roles?: string[]; isActive: boolean; createdAt: string;
  wishlist?: string[]; addresses?: unknown[];
}

// V055: available roles
const V055_ROLES = ['admin', 'moderator', 'user'] as const;
type V055Role = (typeof V055_ROLES)[number];

const roleBadgeClass: Record<string, string> = {
  admin:     'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  moderator: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  user:      'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
  staff:     'bg-blue-100 text-blue-700',
  manager:   'bg-indigo-100 text-indigo-700',
  support:   'bg-teal-100 text-teal-700',
  customer:  'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
};

export default function AdminUsers() {
  const [page, setPage]   = useState(1);
  const [q, setQ]         = useState('');
  const [roleF, setRoleF] = useState('');

  const queryStr = new URLSearchParams({
    page: String(page), limit: '20',
    ...(q     ? { q }    : {}),
    ...(roleF ? { role: roleF } : {}),
  }).toString();

  const { data, mutate } = useSWR<{
    success: boolean;
    data: { users: User[]; pagination: { total: number; pages: number } };
  }>(`/api/v1/users?${queryStr}`, fetcher);

  const users      = data?.data?.users ?? [];
  const pagination = data?.data?.pagination;

  const toggleBlock = async (user: User) => {
    const action = user.isActive ? 'block' : 'unblock';
    const res    = await apiFetch(`/api/v1/users/${user._id}`, { method: 'PATCH', body: JSON.stringify({ action }) });
    const json   = await res.json();
    if (json.success) { toast.success(`User ${action}ed`); mutate(); }
    else              toast.error(json.error || 'Action failed');
  };

  const deleteUser = async (user: User) => {
    if (!confirm(`Delete user ${user.name}? This cannot be undone.`)) return;
    const res  = await apiFetch(`/api/v1/users/${user._id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { toast.success('User deleted'); mutate(); }
    else              toast.error(json.error || 'Delete failed');
  };

  // V055: grant a role to a user
  const grantRole = async (user: User, role: V055Role) => {
    const res  = await apiFetch(`/api/v1/admin/users/${user._id}/roles`, {
      method: 'POST',
      body:   JSON.stringify({ role }),
    });
    const json = await res.json();
    if (json.success) { toast.success(`Role "${role}" granted`); mutate(); }
    else              toast.error(json.error || 'Grant role failed');
  };

  // V055: revoke a role from a user
  const revokeRole = async (user: User, role: string) => {
    const res  = await apiFetch(`/api/v1/admin/users/${user._id}/roles/${role}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { toast.success(`Role "${role}" revoked`); mutate(); }
    else              toast.error(json.error || 'Revoke role failed');
  };

  const getEffectiveRoles = (user: User): string[] => {
    if (user.roles && user.roles.length > 0) return user.roles;
    return [user.role];
  };

  return (
    <div>
      <h1 className="text-4xl font-serif text-[#1A1208] dark:text-[#F0EBE2] mb-6">Customers</h1>

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
                {['User', 'Email', 'Phone', 'Roles', 'Status', 'Joined', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No users found</td></tr>
              )}
              {users.map(u => {
                const effectiveRoles = getEffectiveRoles(u);
                return (
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
                      <div className="flex flex-wrap gap-1">
                        {effectiveRoles.map(role => (
                          <span key={role} className={`px-2 py-0.5 rounded-full text-xs font-semibold ${roleBadgeClass[role] ?? 'bg-gray-100 text-gray-600'}`}>
                            {role}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${u.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                        {u.isActive ? 'Active' : 'Blocked'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <button onClick={() => toggleBlock(u)}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${u.isActive ? 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100' : 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100'}`}>
                            {u.isActive ? 'Block' : 'Unblock'}
                          </button>
                          {!effectiveRoles.includes('admin') && (
                            <button onClick={() => deleteUser(u)} className="px-2 py-1 bg-red-50 border border-red-200 rounded text-xs font-medium text-red-600 hover:bg-red-100 transition-colors">Delete</button>
                          )}
                        </div>
                        {/* V055: Role grant/revoke */}
                        <div className="flex flex-wrap gap-1">
                          {V055_ROLES.map(role => {
                            const hasRole = effectiveRoles.includes(role);
                            return (
                              <button
                                key={role}
                                onClick={() => hasRole ? revokeRole(u, role) : grantRole(u, role)}
                                title={hasRole ? `Revoke "${role}" role` : `Grant "${role}" role`}
                                className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                                  hasRole
                                    ? 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700'
                                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700'
                                }`}
                              >
                                {hasRole ? `− ${role}` : `+ ${role}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pagination && pagination.pages > 1 && (
          <div className="px-4 py-3 border-t border-[#E8DDD0] dark:border-[#2A1F14] flex items-center justify-between">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40 hover:bg-[#F2EDE6] transition-colors">← Prev</button>
            <span className="text-sm text-gray-500">Page {page} of {pagination.pages}</span>
            <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40 hover:bg-[#F2EDE6] transition-colors">Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
