// src/... — HemaV050: shared URL validators (MED-01 fix)
// Single source of truth for the image domain allowlist used by products
// (create + update) and reviews endpoints. Previously each route defined its
// own copy of ALLOWED_IMAGE_DOMAINS and isAllowedImageUrl, creating a
// maintenance risk where one copy could drift from the others.

// LOW-01 FIX (V067): Changed from wildcard subdomain matching to an exact Set lookup.
// Previously `parsed.hostname.endsWith('.domain')` allowed arbitrary subdomains
// (e.g. evil.res.cloudinary.com). Now only exact hostnames are permitted.
const ALLOWED_IMAGE_HOSTS = new Set([
  'res.cloudinary.com',
  'images.unsplash.com',
  'placehold.co',
]);

/**
 * Returns true only if the URL:
 *   1. Uses HTTPS (never HTTP — prevents downgrade / mixed-content attacks)
 *   2. Originates from an explicitly allowed image CDN (exact hostname match — no wildcards)
 *
 * Prevents SSRF via the Next.js image optimizer and content-injection /
 * tracking-pixel risks when user-supplied URLs are stored and later rendered.
 */
export function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_IMAGE_HOSTS.has(parsed.hostname); // exact match only — no wildcards
  } catch {
    return false;
  }
}
