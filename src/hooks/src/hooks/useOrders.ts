// src/hooks/useOrders.ts
import useSWR from 'swr';
import type { IOrder, ApiResponse } from '@/types';
import { useSession } from 'next-auth/react';

const fetcher = (url: string) =>
  fetch(url).then(r => { if (!r.ok) throw new Error('Fetch failed'); return r.json(); });

function buildQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  return qs.toString() ? `?${qs}` : '';
}

export function useOrders(status?: string, page = 1) {
  const { data: session } = useSession();
  const query = buildQuery({ status, page, limit: 10 });
  return useSWR<ApiResponse<{ orders: IOrder[] }>>(
    session ? `/api/orders${query}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
}

export function useOrder(id?: string) {
  const { data: session } = useSession();
  return useSWR<ApiResponse<IOrder>>(
    id && session ? `/api/orders/${id}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
}