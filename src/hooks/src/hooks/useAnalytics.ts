// src/hooks/useAnalytics.ts
import useSWR from 'swr';
import type { DashboardStats, ApiResponse } from '@/types';

const fetcher = (url: string) =>
  fetch(url).then(r => { if (!r.ok) throw new Error('Fetch failed'); return r.json(); });

export function useAnalytics() {
  return useSWR<ApiResponse<DashboardStats>>(
    '/api/analytics',
    fetcher,
    { revalidateOnFocus: false, revalidateOnMount: true }
  );
}