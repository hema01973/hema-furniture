'use client';
// src/... — V045
// Wishlist page: shows saved products, syncs with server for logged-in users,
// allows adding to cart or removing from wishlist.
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import useSWR from 'swr';
import { useWishlistStore, useCartStore, useUIStore } from '@/store/cartStore';
import { apiFetch } from '@/lib/fetchWithCsrf';
import toast from 'react-hot-toast';
import type { IProduct } from '@/types';

const fetcher = (u: string) => fetch(u).then(r => r.json());

const T = {
  en: {
    title:       'My Wishlist',
    empty:       'Your wishlist is empty',
    emptySub:    'Save products you love and come back to them anytime.',
    browse:      'Browse Shop',
    addToCart:   'Add to Cart',
    remove:      'Remove',
    outOfStock:  'Out of Stock',
    currency:    'EGP',
    loading:     'Loading your wishlist…',
    added:       (n: string) => `${n} added to cart`,
    removed:     (n: string) => `${n} removed from wishlist`,
    items:       (n: number) => `${n} item${n !== 1 ? 's' : ''}`,
  },
  ar: {
    title:       'قائمة الأمنيات',
    empty:       'قائمة أمنياتك فارغة',
    emptySub:    'احفظ المنتجات التي تعجبك وارجع إليها في أي وقت.',
    browse:      'تصفح المتجر',
    addToCart:   'أضف للسلة',
    remove:      'إزالة',
    outOfStock:  'غير متوفر',
    currency:    'جنيه',
    loading:     'جاري تحميل قائمة أمنياتك…',
    added:       (n: string) => `تمت إضافة ${n} للسلة`,
    removed:     (n: string) => `تمت إزالة ${n} من المفضلة`,
    items:       (n: number) => `${n} ${n === 1 ? 'منتج' : 'منتجات'}`,
  },
};

export default function WishlistPage() {
  const { data: session, status } = useSession();
  const { lang } = useUIStore();
  const ar = lang === 'ar';
  const t = T[ar ? 'ar' : 'en'];

  const { ids, toggle, clear } = useWishlistStore();
  const addToCart = useCartStore(s => s.addItem);

  const [products, setProducts] = useState<IProduct[]>([]);
  const [loading,  setLoading]  = useState(false);

  // Sync wishlist IDs from server for logged-in users
  const { data: syncData } = useSWR(
    status === 'authenticated' ? '/api/v1/users/wishlist/sync' : null,
    fetcher,
  );

  // Merge server wishlist IDs into local store
  useEffect(() => {
    if (!syncData?.data?.wishlist) return;
    const serverIds: string[] = syncData.data.wishlist;
    serverIds.forEach(id => {
      if (!ids.includes(id)) toggle(id);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncData]);

  // Fetch full product data for each wishlist ID
  const fetchProducts = useCallback(async () => {
    if (ids.length === 0) { setProducts([]); return; }
    setLoading(true);
    try {
      const results = await Promise.allSettled(
        ids.map(id => fetch(`/api/v1/products/${id}`).then(r => r.json()))
      );
      const valid = results
        .filter((r): r is PromiseFulfilledResult<{ success: boolean; data: IProduct }> =>
          r.status === 'fulfilled' && r.value?.success)
        .map(r => r.value.data);
      setProducts(valid);
    } catch {
      // silent — products just won't show
    } finally {
      setLoading(false);
    }
  }, [ids]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const handleRemove = async (product: IProduct) => {
    toggle(product._id);
    // Sync removal to server if logged in
    if (status === 'authenticated') {
      try {
        await apiFetch('/api/v1/users/wishlist', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ productId: product._id }),
        });
      } catch { /* non-fatal */ }
    }
    toast.success(t.removed(ar ? product.nameAr : product.nameEn));
  };

  const handleAddToCart = (product: IProduct) => {
    if (!product.stock || product.stock < 1) return;
    addToCart(product, 1);
    toast.success(t.added(ar ? product.nameAr : product.nameEn));
  };

  const isAr = ar;

  return (
    <main className={`min-h-screen bg-cream dark:bg-[#0E0904] pt-8 pb-20 ${isAr ? 'rtl font-arabic' : ''}`}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl sm:text-4xl text-espresso dark:text-cream font-normal">
              {t.title}
            </h1>
            {products.length > 0 && (
              <p className="text-sm text-gray-400 mt-1">{t.items(products.length)}</p>
            )}
          </div>
          {products.length > 0 && (
            <button
              onClick={() => { clear(); toast.success(isAr ? 'تم مسح المفضلة' : 'Wishlist cleared'); }}
              className="text-sm text-red-400 hover:text-red-600 transition-colors"
            >
              {isAr ? 'مسح الكل' : 'Clear all'}
            </button>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-400 text-sm">{t.loading}</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && ids.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-6xl mb-6">♡</div>
            <h2 className="font-serif text-2xl text-espresso dark:text-cream mb-2">{t.empty}</h2>
            <p className="text-gray-400 text-sm mb-8 max-w-xs">{t.emptySub}</p>
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 bg-gold hover:bg-gold/90 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              {t.browse} →
            </Link>
          </div>
        )}

        {/* Products grid */}
        {!loading && products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map(product => (
              <div
                key={product._id}
                className="bg-white dark:bg-[#1A1208] rounded-2xl overflow-hidden border border-sand dark:border-sand/20 hover:shadow-furniture-lg transition-shadow group"
              >
                {/* Image */}
                <Link href={`/product/${product.slug}`} className="block relative aspect-square overflow-hidden bg-sand-light">
                  {product.images?.[0] ? (
                    <Image
                      src={product.images[0]}
                      alt={ar ? product.nameAr : product.nameEn}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">🛋</div>
                  )}
                  {product.badge && (
                    <span className="absolute top-3 left-3 bg-gold text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                      {product.badge}
                    </span>
                  )}
                  {product.stock === 0 && (
                    <div className="absolute inset-0 bg-white/60 dark:bg-black/60 flex items-center justify-center">
                      <span className="bg-gray-800 text-white text-xs font-semibold px-3 py-1 rounded-full">{t.outOfStock}</span>
                    </div>
                  )}
                </Link>

                {/* Info */}
                <div className="p-4">
                  <Link href={`/product/${product.slug}`}>
                    <h3 className="font-medium text-espresso dark:text-cream text-sm line-clamp-2 hover:text-gold transition-colors mb-2">
                      {ar ? product.nameAr : product.nameEn}
                    </h3>
                  </Link>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-gold font-bold text-sm">
                      {t.currency} {product.price.toLocaleString()}
                    </span>
                    {product.oldPrice && product.oldPrice > product.price && (
                      <span className="text-gray-400 text-xs line-through">
                        {product.oldPrice.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAddToCart(product)}
                      disabled={!product.stock || product.stock < 1}
                      className="flex-1 bg-espresso hover:bg-espresso/90 disabled:bg-gray-200 disabled:text-gray-400 text-cream text-xs font-semibold py-2 rounded-lg transition-colors"
                    >
                      {product.stock > 0 ? t.addToCart : t.outOfStock}
                    </button>
                    <button
                      onClick={() => handleRemove(product)}
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-red-200 dark:border-red-900/40 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm"
                      aria-label={t.remove}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
