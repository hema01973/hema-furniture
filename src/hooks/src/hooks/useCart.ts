// src/hooks/useCart.ts
import { useCartStore } from '@/store/cartStore';
import { useCallback } from 'react';
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