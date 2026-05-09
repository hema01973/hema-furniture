// src/hooks/useOrders.ts
import useSWR, { SWRConfiguration } from 'swr';
import { useSession } from 'next-auth/react';
import type { IOrder, ApiResponse } from '@/types';

const fetcher = (url: string) =>
  fetch(url).then(r => { if (!r.ok) throw new Error('Fetch failed'); return r.json(); });

function buildQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  return qs.toString() ? `?${qs}` : '';
}

export function useOrders(status?: string, page = 1, options?: SWRConfiguration) {
  const { data: session } = useSession();
  const query = buildQuery({ status, page, limit: 10 });
  return useSWR<ApiResponse<{ orders: IOrder[] }>>(
    session ? `/api/v1/orders${query}` : null,
    fetcher,
    { revalidateOnFocus: false, ...options }
  );
}

export function useOrder(id?: string, options?: SWRConfiguration) {
  const { data: session } = useSession();
  return useSWR<ApiResponse<IOrder>>(
    id && session ? `/api/v1/orders/${id}` : null,
    fetcher,
    { revalidateOnFocus: false, ...options }
  );
}
