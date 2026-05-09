// src/app/api/v1/products/route.ts — HemaV071
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { ok, err, withErrorHandler, validateBody, getPagination } from '@/lib/api';
import { requirePermission } from '@/lib/authz';
import { listProducts, invalidateProductCache } from '@/services/product.service';
import { sanitize, sanitizeQuery } from '@/lib/sanitize';
import { connectDB, Product, nextSeq } from '@/lib/mongodb'; // LOW-05 FIX (V066): nextSeq for atomic SKU
import slugify from 'slugify';
import { isAllowedImageUrl } from '@/lib/validators';

const CATEGORY_VALUES = ['living', 'bedroom', 'dining', 'office', 'outdoor'] as const;

// HIGH-03 FIX (V067): Added rateMax:60/60s rate limiting to the product search route.
// Previously no rate limiting — vulnerable to DoS via search query enumeration.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const { page, limit } = getPagination(req);

  const result = await listProducts({
    category:  sanitize(url.searchParams.get('category') ?? ''),
    sort:      sanitize(url.searchParams.get('sort')     ?? 'newest'),
    q:         sanitizeQuery(url.searchParams.get('q') ?? ''),
    badge:     sanitize(url.searchParams.get('badge')    ?? ''),
    brand:     sanitize(url.searchParams.get('brand')    ?? ''),
    // HIGH-001 FIX (V071): Clamp price values to prevent MongoDB full collection scan.
    // Values like -Infinity or 1e308 cause MongoDB query planner to skip indexes.
    // Max 10_000_000 is appropriate for furniture pricing; min is always 0.
    maxPrice:  url.searchParams.get('maxPrice')  ? Math.max(0, Math.min(parseFloat(url.searchParams.get('maxPrice')!),  10_000_000)) : undefined,
    minPrice:  url.searchParams.get('minPrice')  ? Math.max(0, Math.min(parseFloat(url.searchParams.get('minPrice')!),  10_000_000)) : undefined,
    minRating: url.searchParams.get('minRating') ? parseFloat(url.searchParams.get('minRating')!) : undefined,
    featured:  url.searchParams.get('featured')  === 'true',
    inStock:   url.searchParams.get('inStock')   === 'true',
    page, limit,
  });

  return ok(result);
// HIGH-03 FIX (V067): 60 requests per minute per IP — prevents search-based DoS.
}, { rateMax: 60, rateWindow: 60 });

const CreateProductSchema = z.object({
  nameEn:        z.string().min(2).max(200).transform(v => sanitize(v)),
  nameAr:        z.string().min(2).max(200).transform(v => sanitize(v)),
  descEn:        z.string().max(5000).optional().default('').transform(v => sanitize(v)),
  descAr:        z.string().max(5000).optional().default('').transform(v => sanitize(v)),
  price:         z.number().positive('Price must be greater than 0'),
  oldPrice:      z.number().positive().optional(),
  category:      z.enum(CATEGORY_VALUES),
  // V027 FIX (High #2): replaced the Unsplash default image with a locally
  // served placeholder. Unsplash direct-link URLs can disappear without notice
  // and their ToS does not guarantee availability for production use.
  // The placeholder at /images/product-placeholder.svg is served from the app's
  // own public directory — no external dependency.
  // V040 FIX [MED-01]: enforce domain allowlist on explicitly supplied URLs.
  // The default ('/images/product-placeholder.svg') is a Zod default applied
  // when the field is absent; it bypasses per-element validation intentionally.
  images:        z.array(
    z.string().url()
      .refine(isAllowedImageUrl, 'Image must be hosted on an allowed domain (Cloudinary, Unsplash, or Placehold)')
  ).min(1).default([
    '/images/product-placeholder.svg',
  ]),
  stock:         z.number().int().min(0).default(0),
  badge:         z.enum(['New', 'Sale', 'Best Seller', 'Limited']).optional(),
  material:      z.string().max(200).optional().transform(v => v ? sanitize(v) : undefined),
  materialAr:    z.string().max(200).optional().transform(v => v ? sanitize(v) : undefined),
  colors:        z.array(z.string()).optional().default([]),
  brand:         z.string().max(100).optional().transform(v => v ? sanitize(v) : undefined),
  tags:          z.array(z.string().max(50)).max(20).optional().default([]),
  isActive:      z.boolean().optional().default(true),
  isFeatured:    z.boolean().optional().default(false),
  warrantyYears: z.number().int().min(0).max(20).optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await requirePermission(req, 'write:product');
  if (!auth.ok) return auth.response;
  const v = await validateBody(req, CreateProductSchema);
  if ('error' in v) return v.error;
  await connectDB();

  const baseSlug = slugify(v.data.nameEn, { lower: true, strict: true }) || `product-${Date.now()}`;
  const { category, ...rest } = v.data;
  const catCode = category.toUpperCase().slice(0, 3);

  // V011: P1-04 / P1-05 — defend against duplicate-key races on `slug` and
  // `sku` when two admins POST the same product nearly simultaneously. The
  // previous read-then-create pattern observed `null` for both writers, both
  // tried to insert the same slug/sku, and one returned 500 to the admin.
  // Retry up to 3 times: each attempt re-derives slug + sku with a fresh
  // suffix. After 3 attempts something else is wrong — surface the error.
  // V027 FIX (Critical #2): `collision` variable was referenced but never declared.
  // On attempt=0 the OR short-circuit evaluated an undefined identifier, producing
  // a suffix on EVERY first attempt (wrong) or a ReferenceError in strict mode.
  // Fix: track duplicate-key collision explicitly with a boolean flag.
  const MAX_ATTEMPTS = 3;
  let hadCollision = false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // V016 FIX: use crypto.randomBytes instead of Date.now() for slug disambiguation.
    // Date.now() produces the same value for concurrent requests in the same millisecond,
    // meaning two simultaneous admin POSTs for the same product name could still collide.
    // randomBytes(4) gives 2^32 possible suffixes — collision probability is negligible.
    const suffix = attempt > 0 || hadCollision
      ? `-${crypto.randomBytes(4).toString('hex')}`
      : '';
    const slug = `${baseSlug}${suffix}`;
    const count = await Product.countDocuments();
    const sku   = `HEM-${catCode}-${String(count + 1 + attempt).padStart(4, '0')}`;
    try {
      const product = await (Product.create as any)({ ...rest, slug, sku, category: { main: category } });
      await invalidateProductCache();
      return ok(product, 201);
    } catch (e: unknown) {
      const code = (e as { code?: number }).code;
      // 11000 = MongoDB duplicate-key. Retry; anything else, propagate.
      if (code !== 11000 || attempt === MAX_ATTEMPTS - 1) throw e;
      hadCollision = true; // V027: signal next iteration to always use a suffix
      // small jitter so concurrent retries don't collide on Date.now() again
      await new Promise(r => setTimeout(r, 5 + Math.floor(Math.random() * 20)));
    }
  }

  // Unreachable — the loop either returns or throws.
  return ok({ message: 'unexpected' }, 500);
});
