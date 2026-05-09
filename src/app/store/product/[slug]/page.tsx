// src/... — HemaV050: RSC + generateStaticParams + JSON-LD
import type { Metadata } from 'next';
import { Suspense }      from 'react';
import { notFound }      from 'next/navigation';
// V039 SECURITY FIX [MED-04]: import headers to read CSP nonce for JSON-LD script
import { headers }       from 'next/headers';
import { getProduct, listProducts } from '@/services/product.service';
import ProductDetailPage from '@/components/product/ProductDetailPage';

type Props = { params: { slug: string } };

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hemafurniture.com';

// Pre-generate top featured products at build time
export async function generateStaticParams() {
  try {
    const { products } = await listProducts({ featured: true, limit: 50 });
    return products.map(p => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProduct(params.slug);
  if (!p) return { title: 'Product Not Found | Hema Furniture' };

  const url = `${BASE_URL}/product/${params.slug}`;
  return {
    title:       `${p.nameEn} | Hema Furniture`,
    description: p.descEn?.slice(0, 160) ?? '',
    keywords:    [...(p.tags ?? []), 'furniture egypt', 'أثاث مصر'],
    alternates:  { canonical: url, languages: { en: url, ar: url, 'x-default': url } },
    openGraph: {
      type:        'website', url,
      title:       p.nameEn,
      description: p.descEn?.slice(0, 160) ?? '',
      images:      p.images?.[0] ? [{ url: p.images[0], width: 1200, height: 630, alt: p.nameEn }] : [],
    },
    twitter: {
      card:        'summary_large_image',
      title:       p.nameEn,
      description: p.descEn?.slice(0, 160) ?? '',
      images:      p.images?.[0] ? [p.images[0]] : [],
    },
  };
}

async function ProductJsonLd({ p }: { p: ReturnType<typeof getProduct> extends Promise<infer T> ? NonNullable<T> : never }) {
  const schema = {
    '@context':  'https://schema.org',
    '@type':     'Product',
    name:        p.nameEn,
    description: p.descEn,
    image:       p.images ?? [],
    sku:         p.sku,
    brand:       { '@type': 'Brand', name: p.brand ?? 'Hema Furniture' },
    offers: {
      '@type':        'Offer',
      url:            `${BASE_URL}/product/${p.slug}`,
      priceCurrency:  'EGP',
      price:          p.price,
      availability:   p.stock > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: 'Hema Modern Furniture' },
    },
    ...(p.reviewCount > 0 && {
      aggregateRating: {
        '@type':      'AggregateRating',
        ratingValue:  p.rating.toFixed(1),
        reviewCount:  p.reviewCount,
        bestRating:   '5',
        worstRating:  '1',
      },
    }),
  };
  // Safe — server-rendered only, no user data in schema
  // V039 SECURITY FIX [MED-04]: added nonce (required by nonce-based CSP) and
  // HTML-safe unicode escaping to prevent JSON injection if an admin saves a
  // product name containing </script> (defense-in-depth beyond sanitizer).
  const nonce = (await headers()).get('x-nonce') ?? '';
  const safeJson = JSON.stringify(schema)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: safeJson }}
    />
  );
}

export default async function Page({ params }: Props) {
  const p = await getProduct(params.slug);
  if (!p) notFound();

  return (
    <>
      <ProductJsonLd p={p} />
      <Suspense fallback={
        <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904]">
          <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="aspect-square rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
            <div className="space-y-4">
              <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse w-3/4" />
              <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse w-1/3" />
              <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
              <div className="h-12 bg-[#B8935A]/20 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      }>
        <ProductDetailPage slug={params.slug} initialProduct={p} />
      </Suspense>
    </>
  );
}

// ISR: revalidate every hour, on-demand via revalidateTag('products')
export const revalidate = 3600;
