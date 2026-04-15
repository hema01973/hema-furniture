// src/hooks/useProducts.ts
import useSWR, { SWRConfiguration } from 'swr';
import useSWRInfinite from 'swr/infinite';
import type { IProduct, IProductFilters, ProductSortKey, ApiResponse } from '@/types';

const fetcher = (url: string) =>
  fetch(url).then(r => { if (!r.ok) throw new Error('Fetch failed'); return r.json(); });

// ─── Build query string ──────────────────────────────────────
function buildQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  return qs.toString() ? `?${qs}` : '';
}

// ─── Fetch products list ─────────────────────────────────────
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

// ─── Infinite scroll products ────────────────────────────────
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

// ─── Fetch single product ────────────────────────────────────
export function useProduct(idOrSlug?: string, options?: SWRConfiguration) {
  return useSWR<ApiResponse<IProduct>>(
    idOrSlug ? `/api/products/${idOrSlug}` : null,
    fetcher,
    { revalidateOnFocus: false, ...options }
  );
}

// ─── Featured products ───────────────────────────────────────
export function useFeaturedProducts() {
  return useSWR<ApiResponse<{ products: IProduct[] }>>(
    '/api/products?featured=true&limit=8',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
}

// ─── Search products ─────────────────────────────────────────
export function useProductSearch(query: string, enabled = true) {
  return useSWR<ApiResponse<{ products: IProduct[] }>>(
    enabled && query.length >= 2 ? `/api/products?q=${encodeURIComponent(query)}&limit=8` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 1000 }
  );
}

// ─────────────────────────────────────────────────────────────
// src/hooks/useOrders.ts
// ─────────────────────────────────────────────────────────────
import type { IOrder } from '@/types';
import { useSession } from 'next-auth/react';

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

// ─────────────────────────────────────────────────────────────
// src/hooks/useAnalytics.ts
// ─────────────────────────────────────────────────────────────
import type { DashboardStats } from '@/types';

export function useAnalytics() {
  return useSWR<ApiResponse<DashboardStats>>(
    '/api/analytics',
    fetcher,
    { revalidateOnFocus: false, revalidateOnMount: true }
  );
}

// ─────────────────────────────────────────────────────────────
// src/hooks/useCart.ts
// ─────────────────────────────────────────────────────────────
import { useCartStore } from '@/store/cartStore';
import { useCallback }  from 'react';
import type { IProduct } from '@/types';
import toast from 'react-hot-toast';

export function useCart() {
  const store = useCartStore();

  const add = useCallback((product: IProduct, qty = 1, color?: string) => {
    store.addItem(product, qty, color);
    toast.success(`${product.nameEn} added to cart`, { icon: '🛒', duration: 2000 });
  }, [store]);

  const remove = useCallback((productId: string) => {
    store.removeItem(productId);
    toast.success('Item removed', { duration: 1500 });
  }, [store]);

  return { ...store, add, remove };
}
