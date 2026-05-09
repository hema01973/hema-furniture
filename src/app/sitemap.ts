// src/... — HemaV050: paginated, no longer caps at 500 products
import { MetadataRoute } from 'next';
import { connectDB, Product } from '@/lib/mongodb';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hemafurniture.com';
const PAGE_SIZE = 5000; // Google sitemap limit is 50k URLs/file; we stay well under

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL,                  lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
    { url: `${BASE_URL}/shop`,        lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE_URL}/cart`,        lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/login`,       lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE_URL}/register`,    lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
  ];

  // V009 FIX: previous version called listProducts({ limit: 500 }) and silently
  // dropped every product after the first 500 — invisible SEO loss as the
  // catalog grew. We now stream all active products in pages directly from the
  // DB (avoids the per-page cache writes from the service layer).
  const productRoutes: MetadataRoute.Sitemap = [];
  try {
    await connectDB();
    let page = 0;
    while (true) {
      const batch = await (Product.find as any)({ isActive: true })
        .select('slug updatedAt')
        .sort({ _id: 1 })
        .skip(page * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean();
      if (batch.length === 0) break;
      for (const p of batch) {
        productRoutes.push({
          url:             `${BASE_URL}/product/${p.slug}`,
          lastModified:    new Date(p.updatedAt),
          changeFrequency: 'weekly' as const,
          priority:        0.8,
        });
      }
      if (batch.length < PAGE_SIZE) break;
      page++;
      // Safety cap (sitemap.xml hard limit = 50k URLs)
      if (productRoutes.length >= 49_000) break;
    }
  } catch {
    // DB unreachable at build time — return static routes only
  }

  return [...staticRoutes, ...productRoutes];
}
