// src/hooks/useProducts.ts
import useSWR, { SWRConfiguration } from 'swr';
import useSWRInfinite from 'swr/infinite';
import type { IProduct, IProductFilters, ProductSortKey, ApiResponse } from '@/types';

const fetcher = (url: string) =>
  fetch(url).then(r => { if (!r.ok) throw new Error('Fetch failed'); return r.json(); });

function buildQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  return qs.toString() ? `?${qs}` : '';
}

export function useProducts(
  filters?: IProductFilters,
  sort?: ProductSortKey,
  page = 1,
  limit = 12,
  options?: SWRConfiguration
) {
  const query = buildQuery({ ...filters, sort, page, limit });
  return useSWR<ApiResponse<{ products: IProduct[]; pagination: unknown }>>(
    `/api/products${query}`,
    fetcher,
    { revalidateOnFocus: false, ...options }
  );
}

export function useProductsInfinite(filters?: IProductFilters, sort?: ProductSortKey) {
  return useSWRInfinite<ApiResponse<{ products: IProduct[]; pagination: { pages: number } }>>(
    (pageIndex, prev) => {
      if (prev && pageIndex >= (prev.data?.pagination as { pages: number })?.pages) return null;
      return `/api/products${buildQuery({ ...filters, sort, page: pageIndex + 1, limit: 12 })}`;
    },
    fetcher,
    { revalidateFirstPage: false }
  );
}

export function useProduct(idOrSlug?: string, options?: SWRConfiguration) {
  return useSWR<ApiResponse<IProduct>>(
    idOrSlug ? `/api/products/${idOrSlug}` : null,
    fetcher,
    { revalidateOnFocus: false, ...options }
  );
}

export function useFeaturedProducts() {
  return useSWR<ApiResponse<{ products: IProduct[] }>>(
    '/api/products?featured=true&limit=8',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
}

export function useProductSearch(query: string, enabled = true) {
  return useSWR<ApiResponse<{ products: IProduct[] }>>(
    enabled && query.length >= 2 ? `/api/products?q=${encodeURIComponent(query)}&limit=8` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 1000 }
  );
}