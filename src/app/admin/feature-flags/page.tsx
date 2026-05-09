'use client';
// src/app/admin/feature-flags/page.tsx — HemaV050
// Visual admin interface for runtime feature flag management.
// Allows toggling flags without code changes or redeployment.

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { apiFetch } from '@/lib/fetchWithCsrf';
import { useUIStore } from '@/store/cartStore';
import toast from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

interface FlagsResponse {
  flags: Record<string, boolean>;
}

// Human-readable metadata for each flag
const FLAG_META: Record<string, { label: string; description: string; category: string }> = {
  // Checkout & Payments
  new_checkout_flow: { label: 'New Checkout Flow',  description: 'Enable the redesigned checkout experience', category: 'Checkout & Payments' },
  fawry_payments:    { label: 'Fawry Payments',     description: 'Accept payments via Fawry',                 category: 'Checkout & Payments' },
  valu_payments:     { label: 'ValU Payments',      description: 'Accept buy-now-pay-later via ValU',         category: 'Checkout & Payments' },
  guest_checkout:    { label: 'Guest Checkout',     description: 'Allow orders without an account',           category: 'Checkout & Payments' },
  // Product Features
  product_compare:   { label: 'Product Compare',   description: 'Side-by-side product comparison tool',      category: 'Product Features' },
  ar_product_search: { label: 'Arabic Search',     description: 'Full-text search in Arabic',                category: 'Product Features' },
  // UX
  dark_mode:         { label: 'Dark Mode',         description: 'Dark theme toggle for customers',           category: 'UX' },
  loyalty_program:   { label: 'Loyalty Program',   description: 'Points and rewards system',                 category: 'UX' },
  // Operations
  maintenance_mode:  { label: 'Maintenance Mode',  description: '⚠️ Shows maintenance page to all visitors', category: 'Operations' },
  // Admin
  bulk_order_import:    { label: 'Bulk Order Import',   description: 'Import orders from CSV/Excel',          category: 'Admin' },
  advanced_analytics:   { label: 'Advanced Analytics',  description: 'Enable extended analytics dashboard',   category: 'Admin' },
};

const CATEGORIES = ['Checkout & Payments', 'Product Features', 'UX', 'Operations', 'Admin'];

// ── Fetcher ────────────────────────────────────────────────────────────────────

async function flagsFetcher(url: string): Promise<FlagsResponse> {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load flags');
  const json = await res.json();
  return json.data ?? json;
}

// ── Toggle Switch Component ────────────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  dangerous,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
  dangerous?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      aria-checked={checked}
      role="switch"
      className={[
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        checked
          ? dangerous
            ? 'bg-red-500 focus:ring-red-500'
            : 'bg-[#B8935A] focus:ring-[#B8935A]'
          : 'bg-gray-300 dark:bg-gray-600 focus:ring-gray-400',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
          checked ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function FeatureFlagsPage() {
  const { lang } = useUIStore();
  const ar = lang === 'ar';

  const { data, error, isLoading, mutate } = useSWR<FlagsResponse>(
    '/api/v1/admin/feature-flags',
    flagsFetcher,
    { refreshInterval: 30_000 },
  );

  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<'all' | 'enabled' | 'disabled'>('all');

  const handleToggle = useCallback(
    async (flag: string, newValue: boolean) => {
      if (toggling[flag]) return;

      // Confirm dangerous flags
      if (flag === 'maintenance_mode' && newValue) {
        const confirmed = window.confirm(
          '⚠️ Enabling Maintenance Mode will show a maintenance page to ALL visitors.\n\nAre you sure?',
        );
        if (!confirmed) return;
      }

      setToggling(prev => ({ ...prev, [flag]: true }));

      // Optimistic update
      mutate(
        prev => prev ? { flags: { ...prev.flags, [flag]: newValue } } : prev,
        false,
      );

      try {
        const res = await apiFetch('/api/v1/admin/feature-flags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flag, value: newValue }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? 'Update failed');
        }

        toast.success(
          `${FLAG_META[flag]?.label ?? flag} ${newValue ? 'enabled' : 'disabled'}`,
        );
        mutate(); // Revalidate from server
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Failed to update flag');
        mutate(); // Revert optimistic update
      } finally {
        setToggling(prev => ({ ...prev, [flag]: false }));
      }
    },
    [toggling, mutate],
  );

  // ── Compute stats ────────────────────────────────────────────────────────────
  const flags         = data?.flags ?? {};
  const totalFlags    = Object.keys(flags).length;
  const enabledCount  = Object.values(flags).filter(Boolean).length;
  const disabledCount = totalFlags - enabledCount;

  // ── Filter + search ──────────────────────────────────────────────────────────
  const visibleFlags = Object.entries(flags).filter(([key, value]) => {
    const meta = FLAG_META[key];
    const matchesSearch = !search || key.includes(search.toLowerCase()) ||
      meta?.label.toLowerCase().includes(search.toLowerCase()) ||
      meta?.description.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === 'all' ||
      (filter === 'enabled'  && value) ||
      (filter === 'disabled' && !value);
    return matchesSearch && matchesFilter;
  });

  // Group by category
  const byCategory: Record<string, [string, boolean][]> = {};
  for (const entry of visibleFlags) {
    const category = FLAG_META[entry[0]]?.category ?? 'Other';
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category]!.push(entry);
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#B8935A] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading feature flags…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500 text-lg font-semibold mb-2">Failed to load feature flags</p>
        <p className="text-gray-400 text-sm">Check your connection and refresh the page.</p>
        <button
          onClick={() => mutate()}
          className="mt-4 px-4 py-2 bg-[#B8935A] text-white rounded-lg hover:bg-[#a07d4a] transition"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            🚩 Feature Flags
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Toggle features at runtime — changes take effect within 60 seconds across all instances.
          </p>
        </div>
        <button
          onClick={() => mutate()}
          className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Flags', value: totalFlags,    color: 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white' },
          { label: 'Enabled',     value: enabledCount,  color: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' },
          { label: 'Disabled',    value: disabledCount, color: 'bg-gray-50  dark:bg-gray-800/60 text-gray-500 dark:text-gray-400' },
        ].map(stat => (
          <div key={stat.label} className={`${stat.color} rounded-xl p-4 text-center shadow-sm`}>
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-xs mt-1 opacity-80">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Maintenance mode warning banner */}
      {flags['maintenance_mode'] && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">Maintenance Mode is ACTIVE</p>
            <p className="text-sm text-red-600 dark:text-red-500 mt-0.5">
              All visitors are seeing the maintenance page. Disable immediately when work is done.
            </p>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search flags…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#B8935A]"
        />
        {(['all', 'enabled', 'disabled'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={[
              'px-3 py-2 text-sm rounded-lg capitalize transition',
              filter === f
                ? 'bg-[#B8935A] text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
            ].join(' ')}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Flag groups */}
      {visibleFlags.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No flags match your search or filter.
        </div>
      ) : (
        (CATEGORIES.filter(cat => byCategory[cat]?.length)).map(category => (
          <div key={category} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            {/* Category header */}
            <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {category}
              </h2>
            </div>

            {/* Flag rows */}
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {(byCategory[category] ?? []).map(([key, value]) => {
                const meta      = FLAG_META[key];
                const isLoading = !!toggling[key];
                const isDangerous = key === 'maintenance_mode';

                return (
                  <div
                    key={key}
                    className={[
                      'flex items-center justify-between px-5 py-4 gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition',
                      isDangerous && value ? 'bg-red-50/40 dark:bg-red-900/10' : '',
                    ].join(' ')}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {meta?.label ?? key}
                        </span>
                        {isDangerous && (
                          <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">
                            Dangerous
                          </span>
                        )}
                        <span
                          className={[
                            'text-xs px-2 py-0.5 rounded-full font-medium',
                            value
                              ? isDangerous
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
                          ].join(' ')}
                        >
                          {value ? 'ON' : 'OFF'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {meta?.description ?? key}
                      </p>
                      <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5 font-mono">
                        {key}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {isLoading && (
                        <div className="w-4 h-4 border-2 border-[#B8935A] border-t-transparent rounded-full animate-spin" />
                      )}
                      <ToggleSwitch
                        checked={value}
                        onChange={v => handleToggle(key, v)}
                        disabled={isLoading}
                        dangerous={isDangerous}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Footer note */}
      <p className="text-xs text-center text-gray-400 dark:text-gray-600 pb-4">
        Changes persist to Redis and apply across all server instances within 60 seconds.
        Env-var overrides (FEATURE_FLAG_*) take precedence over Redis values.
      </p>
    </div>
  );
}
