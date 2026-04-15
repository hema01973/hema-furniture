// src/store/cartStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { IProduct, CartItem } from '@/types';

// ─── CART STORE ──────────────────────────────────────────────
interface CartStore {
  items:   CartItem[];
  // Actions
  addItem:      (product: IProduct, quantity?: number, color?: string) => void;
  removeItem:   (productId: string) => void;
  updateQty:    (productId: string, quantity: number) => void;
  clearCart:    () => void;
  // Computed
  count:        () => number;
  subtotal:     () => number;
  shipping:     () => number;
  discount:     () => number;
  total:        () => number;
  hasItem:      (productId: string) => boolean;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product, quantity = 1, color) => {
        set(state => {
          const existing = state.items.find(i => i.productId === product._id && i.selectedColor === color);
          if (existing) {
            return {
              items: state.items.map(i =>
                i.productId === product._id && i.selectedColor === color
                  ? { ...i, quantity: Math.min(i.quantity + quantity, 99) }
                  : i
              ),
            };
          }
          return { items: [...state.items, { productId: product._id, product, quantity, selectedColor: color }] };
        });
      },

      removeItem: (productId) =>
        set(state => ({ items: state.items.filter(i => i.productId !== productId) })),

      updateQty: (productId, quantity) => {
        if (quantity < 1) { get().removeItem(productId); return; }
        set(state => ({
          items: state.items.map(i => i.productId === productId ? { ...i, quantity: Math.min(quantity, 99) } : i),
        }));
      },

      clearCart: () => set({ items: [] }),

      count:    () => get().items.reduce((s, i) => s + i.quantity, 0),
      subtotal: () => get().items.reduce((s, i) => s + i.product.price * i.quantity, 0),
      shipping: () => get().subtotal() >= 5000 ? 0 : 299,
      discount: () => 0, // Applied at checkout via coupon
      total:    () => get().subtotal() + get().shipping() - get().discount(),
      hasItem:  (pid) => get().items.some(i => i.productId === pid),
    }),
    {
      name:    'hema-cart',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// ─── WISHLIST STORE ──────────────────────────────────────────
interface WishlistStore {
  ids:    string[];
  toggle: (productId: string) => void;
  has:    (productId: string) => boolean;
  clear:  () => void;
}

export const useWishlistStore = create<WishlistStore>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) => set(state => ({ ids: state.ids.includes(id) ? state.ids.filter(x => x !== id) : [...state.ids, id] })),
      has:    (id) => get().ids.includes(id),
      clear:  () => set({ ids: [] }),
    }),
    { name: 'hema-wishlist', storage: createJSONStorage(() => localStorage) }
  )
);

// ─── UI STORE ────────────────────────────────────────────────
interface UIStore {
  lang:          'en' | 'ar';
  dark:          boolean;
  searchOpen:    boolean;
  mobileOpen:    boolean;
  toggleLang:    () => void;
  toggleDark:    () => void;
  setSearch:     (v: boolean) => void;
  setMobile:     (v: boolean) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      lang:       'en',
      dark:       false,
      searchOpen: false,
      mobileOpen: false,
      toggleLang: () => set(s => ({ lang: s.lang === 'en' ? 'ar' : 'en' })),
      toggleDark: () => set(s => ({ dark: !s.dark })),
      setSearch:  (v) => set({ searchOpen: v }),
      setMobile:  (v) => set({ mobileOpen: v }),
    }),
    { name: 'hema-ui', partialize: (s) => ({ lang: s.lang, dark: s.dark }) }
  )
);
