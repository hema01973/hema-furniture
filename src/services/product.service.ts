// src/... — HemaV050: materialized facets + multi-layer cache
import { connectDB, Product } from '@/lib/mongodb';
import { cacheGet, cacheSet, cacheDel } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { sanitizeQuery } from '@/lib/sanitize';
import type { IProduct } from '@/types';

/** Escape special regex chars to prevent ReDoS via brand/category filter inputs */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ProductFilters {
  category?:  string;
  sort?:      string;
  maxPrice?:  number;
  minPrice?:  number;
  q?:         string;
  featured?:  boolean;
  badge?:     string;
  brand?:     string;
  minRating?: number;
  inStock?:   boolean;
  page?:      number;
  limit?:     number;
}

export interface ProductListResult {
  products:   IProduct[];
  pagination: { page: number; limit: number; total: number; pages: number };
  facets:     { brands: string[]; priceMin: number; priceMax: number };
}

const SORT_MAP: Record<string, Record<string, 1 | -1>> = {
  newest:    { createdAt: -1 },
  popular:   { reviewCount: -1, rating: -1 },
  priceLow:  { price: 1 },
  priceHigh: { price: -1 },
  rating:    { rating: -1 },
};

/** Build a deterministic cache key from filter params */
function filterCacheKey(filters: ProductFilters): string {
  const parts = [
    `cat:${filters.category ?? 'all'}`,
    `sort:${filters.sort ?? 'newest'}`,
    `p:${filters.page ?? 1}`,
    `l:${filters.limit ?? 12}`,
    ...(filters.q         ? [`q:${filters.q}`]               : []),
    ...(filters.badge     ? [`badge:${filters.badge}`]        : []),
    ...(filters.brand     ? [`brand:${filters.brand}`]        : []),
    ...(filters.minPrice  ? [`min:${filters.minPrice}`]       : []),
    ...(filters.maxPrice  ? [`max:${filters.maxPrice}`]       : []),
    ...(filters.minRating ? [`rat:${filters.minRating}`]      : []),
    ...(filters.featured  ? ['featured:1']                    : []),
    ...(filters.inStock   ? ['instock:1']                     : []),
  ];
  return `products:${parts.join('|')}`;
}

export async function listProducts(filters: ProductFilters): Promise<ProductListResult> {
  await connectDB();

  const page  = Math.max(1, filters.page  ?? 1);
  const limit = Math.min(50, Math.max(1, filters.limit ?? 12));
  const skip  = (page - 1) * limit;

  // V011: P2-07 — treat very-short search queries (<2 chars) as if they had
  // no `q` for cache-key purposes. The previous code skipped both the $text
  // filter AND the cache layer for these queries, hammering Mongo with a full
  // unfiltered scan on every keystroke and never caching the result. By
  // dropping `q` from the cache key (when too short to be a real text query)
  // we coalesce them with the cold "all products" page.
  const effectiveFilters = (filters.q && filters.q.trim().length >= 2)
    ? filters
    : { ...filters, q: undefined };
  const cacheKey = filterCacheKey(effectiveFilters);
  if (!effectiveFilters.q) {
    const cached = await cacheGet<ProductListResult>(cacheKey);
    if (cached) return cached;
  }

  // Build MongoDB filter
  const filter: Record<string, unknown> = { isActive: true };
  if (filters.category)  filter['category.main'] = filters.category;
  if (filters.badge)     filter.badge            = filters.badge;
  if (filters.featured)  filter.isFeatured       = true;
  if (filters.brand)     filter.brand            = new RegExp(`^${escapeRegex(filters.brand)}$`, 'i');
  if (filters.inStock)   filter.stock            = { $gt: 0 };
  if (filters.minRating) filter.rating           = { $gte: filters.minRating };
  if (filters.maxPrice || filters.minPrice) {
    filter.price = {
      ...(filters.minPrice ? { $gte: filters.minPrice } : {}),
      ...(filters.maxPrice ? { $lte: filters.maxPrice } : {}),
    };
  }
  if (filters.q) {
    // Sanitize before text search to prevent injection
    const safe = sanitizeQuery(filters.q);
    if (safe.length >= 2) filter.$text = { $search: safe };
  }

  const sort = SORT_MAP[filters.sort ?? 'newest'] ?? SORT_MAP.newest;

  // Facets: materialized and cached per category (5 min TTL)
  const facetKey = `facets:${filters.category ?? 'all'}`;
  let facets = await cacheGet<{ brands: string[]; priceMin: number; priceMax: number }>(facetKey);

  if (!facets) {
    const baseFilter: Record<string, unknown> = { isActive: true };
    if (filters.category) baseFilter['category.main'] = filters.category;

    const [brands, priceAgg] = await Promise.all([
      Product.distinct('brand', baseFilter),
      Product.aggregate([
        { $match: baseFilter },
        { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } },
      ]),
    ]);

    facets = {
      brands:   (brands as string[]).filter(Boolean).sort(),
      priceMin: priceAgg[0]?.min ?? 0,
      priceMax: priceAgg[0]?.max ?? 50_000,
    };
    await cacheSet(facetKey, facets, 300);
    logger.debug('[ProductService] Facets computed', { category: filters.category ?? 'all' });
  }

  const [products, total] = await Promise.all([
    (Product.find as any)(filter).sort(sort).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  const result: ProductListResult = {
    products:   products as unknown as IProduct[],
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    facets,
  };

  // V011: P2-07 — cache the "no-text-filter" branch using effectiveFilters,
  // so very-short `q` values reuse the unfiltered cache entry instead of
  // bypassing the cache entirely.
  if (!effectiveFilters.q) await cacheSet(cacheKey, result, 120);

  return result;
}

export async function getProduct(idOrSlug: string): Promise<IProduct | null> {
  await connectDB();

  const cacheKey = `product:${idOrSlug}`;
  const cached   = await cacheGet<IProduct>(cacheKey);
  if (cached) return cached;

  const isId = /^[a-f\d]{24}$/i.test(idOrSlug);
  const doc  = isId
    ? await (Product.findById as any)(idOrSlug).lean()
    : await (Product.findOne as any)({ slug: idOrSlug, isActive: true }).lean();

  if (!doc) return null;

  await cacheSet(cacheKey, doc, 300);
  return doc as unknown as IProduct;
}

export async function invalidateProductCache(productId?: string): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (productId) {
    tasks.push(cacheDel(`product:${productId}`));
  }

  // Invalidate all category facets + product list pages
  const categories = ['all', 'living', 'bedroom', 'dining', 'office', 'outdoor'];
  tasks.push(...categories.map(c => cacheDel(`facets:${c}`)));

  await Promise.all(tasks);
  logger.info('[ProductService] Cache invalidated', { productId: productId ?? 'all' });
}
