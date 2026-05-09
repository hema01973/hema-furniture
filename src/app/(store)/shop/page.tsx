// src/... — HemaV050: Server Component with RSC data + Suspense
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { listProducts } from '@/services/product.service';
import ShopPage from '@/components/shop/ShopPage';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hemafurniture.com';

export const metadata: Metadata = {
  title:       'Shop All Furniture | Hema Modern Furniture',
  description: 'Browse our full collection of premium modern furniture for Egyptian homes.',
  keywords:    ['furniture shop egypt', 'buy furniture online cairo', 'أثاث للبيع مصر'],
  alternates: {
    canonical: `${BASE_URL}/shop`,
    languages: { en: `${BASE_URL}/shop`, ar: `${BASE_URL}/shop`, 'x-default': `${BASE_URL}/shop` },
  },
  openGraph: {
    title:       'Shop All Furniture | Hema Modern Furniture',
    description: 'Premium modern furniture for Egyptian homes.',
    images:      [{ url: '/og-shop.jpg', width: 1200, height: 630 }],
  },
};

// ISR: revalidate every 30 minutes; cache tags enable on-demand invalidation
export const revalidate = 1800;

interface PageProps {
  searchParams: {
    category?: string; sort?: string; page?: string;
    brand?: string; badge?: string;
    minPrice?: string; maxPrice?: string;
  };
}

function ShopSkeleton() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904] px-4 py-8">
      <div className="max-w-7xl mx-auto">
        <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse w-1/4 mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 12 }).map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      </div>
    </div>
  );
}

// RSC: fetch initial data server-side (no client waterfall)
async function ShopWithData({ searchParams }: PageProps) {
  const initialData = await listProducts({
    category: searchParams.category,
    sort:     searchParams.sort,
    brand:    searchParams.brand,
    badge:    searchParams.badge,
    minPrice: searchParams.minPrice ? parseFloat(searchParams.minPrice) : undefined,
    maxPrice: searchParams.maxPrice ? parseFloat(searchParams.maxPrice) : undefined,
    page:     searchParams.page     ? parseInt(searchParams.page)       : 1,
    limit:    24,
  });

  return <ShopPage initialData={initialData} searchParams={searchParams} />;
}

export default function Page({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<ShopSkeleton />}>
      <ShopWithData searchParams={searchParams} />
    </Suspense>
  );
}
