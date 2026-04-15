// src/app/api/products/route.ts — faceted search + Redis caching of facets
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB, Product } from '@/lib/mongodb';
import { ok, err, withErrorHandler, withAuth, validateBody, getPagination } from '@/lib/api';
import { cacheGet, cacheSet } from '@/lib/redis';
import slugify from 'slugify';

export const GET = withErrorHandler(async (req: NextRequest) => {
  await connectDB();
  const { page, limit, skip } = getPagination(req);
  const url      = new URL(req.url);
  const category = url.searchParams.get('category');
  const sortKey  = url.searchParams.get('sort')       ?? 'newest';
  const maxPrice = url.searchParams.get('maxPrice');
  const minPrice = url.searchParams.get('minPrice');
  const q        = url.searchParams.get('q');
  const featured = url.searchParams.get('featured');
  const badge    = url.searchParams.get('badge');
  const brand    = url.searchParams.get('brand');
  const minRating= url.searchParams.get('minRating');
  const inStock  = url.searchParams.get('inStock');

  const filter: Record<string, unknown> = { isActive: true };
  if (category)  filter.category   = category;
  if (badge)     filter.badge      = badge;
  if (featured)  filter.isFeatured = true;
  if (brand)     filter.brand      = brand;
  if (inStock === 'true')  filter.stock = { $gt: 0 };
  if (minRating) filter.rating     = { $gte: parseFloat(minRating) };
  if (maxPrice || minPrice) {
    filter.price = {
      ...(minPrice ? { $gte: parseFloat(minPrice) } : {}),
      ...(maxPrice ? { $lte: parseFloat(maxPrice) } : {}),
    };
  }
  if (q) filter.$text = { $search: q };

  const sortMap: Record<string, Record<string,1|-1>> = {
    newest:    { createdAt: -1 },
    popular:   { reviewCount: -1, rating: -1 },
    priceLow:  { price: 1 },
    priceHigh: { price: -1 },
    rating:    { rating: -1 },
  };
  const sort = sortMap[sortKey] ?? sortMap.newest;

  // Cache facets per category (5 min TTL)
  const facetKey = `facets:${category ?? 'all'}`;
  let facets = await cacheGet<Record<string, unknown>>(facetKey);
  if (!facets) {
    const baseFilter = { isActive: true, ...(category ? { category } : {}) };
    const [brands, priceAgg] = await Promise.all([
      Product.distinct('brand', baseFilter),
      Product.aggregate([{ $match: baseFilter }, { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }]),
    ]);
    facets = { brands: brands.filter(Boolean), priceMin: priceAgg[0]?.min ?? 0, priceMax: priceAgg[0]?.max ?? 50000 };
    await cacheSet(facetKey, facets, 300);
  }

  const [products, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  return ok({ products, facets, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const CreateProductSchema = z.object({
  nameEn:       z.string().min(2).max(200),
  nameAr:       z.string().min(2).max(200),
  descEn:       z.string().optional().default(''),
  descAr:       z.string().optional().default(''),
  price:        z.number().positive(),
  oldPrice:     z.number().positive().optional(),
  category:     z.enum(['living','bedroom','dining','office','outdoor']),
  images:       z.array(z.string().url()).min(1),
  stock:        z.number().int().min(0).default(0),
  badge:        z.enum(['New','Sale','Best Seller','Limited']).optional(),
  material:     z.string().optional(),
  materialAr:   z.string().optional(),
  colors:       z.array(z.string()).optional().default([]),
  brand:        z.string().optional(),
  tags:         z.array(z.string()).optional().default([]),
  isActive:     z.boolean().optional().default(true),
  isFeatured:   z.boolean().optional().default(false),
  warrantyYears:z.number().int().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  return withAuth(req, async () => {
    const v = await validateBody(req, CreateProductSchema);
    if ('error' in v) return v.error;
    await connectDB();
    let slug = slugify(v.data.nameEn, { lower: true, strict: true });
    if (await Product.findOne({ slug })) slug = `${slug}-${Date.now()}`;
    const count = await Product.countDocuments();
    const sku   = `HEM-${v.data.category.toUpperCase().slice(0,3)}-${String(count+1).padStart(4,'0')}`;
    const product = await Product.create({ ...v.data, slug, sku });
    return ok(product, 201);
  }, ['admin', 'staff']);
});
