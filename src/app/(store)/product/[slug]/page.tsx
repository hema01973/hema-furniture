// src/app/(store)/product/[slug]/page.tsx
import type { Metadata } from 'next';
import ProductDetailPage from '@/components/product/ProductDetailPage';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const res  = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/products/${params.slug}`, { next: { revalidate: 3600 } });
    const data = await res.json();
    if (data.success && data.data) {
      return { title: `${data.data.nameEn} — Hema Furniture`, description: data.data.descEn?.slice(0, 160) };
    }
  } catch { /* fallback */ }
  return { title: 'Product — Hema Furniture' };
}

export default function Page({ params }: Props) { return <ProductDetailPage slug={params.slug} />; }
