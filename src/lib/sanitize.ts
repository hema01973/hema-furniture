// src/... — HemaV066
// V063 FIX-HIGH-04: Extended sanitizeQuery operator stripping.
// LOW-01 FIX (V054): sanitize() now delegates to DOMPurify with ALLOWED_TAGS:[]
// for plain-text values. The previous regex blocklist (stripDangerousBlocks) was
// vulnerable to bypass via Unicode tricks (<ScRiPt>, &#60;script&#62;, etc.).
// DOMPurify with empty allowed tags list is the correct approach for plain text.
// stripAllTags is retained as a server-side-only fallback (non-browser env).

// FIND-006 FIX: replaced @ts-ignore + require() with a proper static import.
// isomorphic-dompurify ships its own types via the "exports" field in package.json
// (isomorphic-dompurify >= 2.x). If the ambient declaration is still needed,
// a types/isomorphic-dompurify.d.ts shim is included in this repo.
// V039 SECURITY FIX [LOW-01]: sanitizeRich now delegates to isomorphic-dompurify.
import DOMPurify from 'isomorphic-dompurify';

/** Sanitize a plain-text value — strips ALL HTML using DOMPurify */
export function sanitize(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  // LOW-01 FIX (V054): DOMPurify with ALLOWED_TAGS:[] strips all HTML including
  // obfuscated variants that regex-based blocklists miss.
  return DOMPurify.sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}

/**
 * LOW-04 FIX (V066): Security contract for sanitizeRich is now documented and enforced.
 *
 * Sanitize rich text — allows a restricted set of safe inline/block HTML using DOMPurify.
 *
 * SECURITY CONTRACT (DO NOT WEAKEN WITHOUT SECURITY REVIEW):
 *   - ALLOWED_ATTR is intentionally empty [] — no attributes permitted.
 *     Adding `href`, `style`, `class`, or any event attribute opens XSS/CSS-injection vectors.
 *   - ALLOWED_TAGS list includes block elements (p, ul, ol, li) — not safe for inline-only contexts.
 *     Use sanitizeInline() when the output is embedded inside an existing block element.
 *   - Never add `href` without also adding `url` filtering (javascript: schema, data: URIs).
 *   - Every change to this config MUST be reviewed against OWASP XSS Prevention Cheat Sheet.
 *
 * For plain-text values: use sanitize() instead.
 * For inline-only fragments (e.g. product subtitle, tag): use sanitizeInline() instead.
 */
export function sanitizeRich(value: unknown): string {
  if (value === null || value === undefined) return '';
  return DOMPurify.sanitize(String(value), {
    ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'br', 'p', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: [], // no attributes — closes all event-handler and style vectors
  });
}


/**
 * LOW-04 FIX (V066): Inline-only variant — safe for fragments embedded inside block elements.
 * Only allows truly inline tags; strips all block-level elements that could break layout.
 *
 * SECURITY CONTRACT: ALLOWED_ATTR is [] — no attributes permitted.
 */
export function sanitizeInline(value: unknown): string {
  if (value === null || value === undefined) return '';
  return DOMPurify.sanitize(String(value), {
    ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em'],
    ALLOWED_ATTR: [], // no attributes — closes all event-handler and style vectors
  });
}

/** Sanitize and normalize an email address */
export function sanitizeEmail(value: unknown): string {
  return sanitize(value).toLowerCase().replace(/\s/g, '');
}

/**
 * Sanitize an entire object's string fields recursively.
 * Useful for sanitizing Mongoose documents before sending to client.
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string') {
      result[key] = sanitize(val);
    } else if (Array.isArray(val)) {
      result[key] = val.map(item =>
        typeof item === 'string' ? sanitize(item) :
        typeof item === 'object' && item !== null ? sanitizeObject(item as Record<string, unknown>) : item
      );
    } else if (typeof val === 'object' && val !== null) {
      result[key] = sanitizeObject(val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  }
  return result as T;
}

/** Sanitize a search query — prevent NoSQL injection patterns */
// V063 FIX-HIGH-04: Extended operator stripping to include dot-notation traversal,
// null bytes, and pipe characters that the previous regex missed.
// MED-002 FIX (V069): Added explicit type guard — reject non-string inputs before
// sanitize(). Previously, Arrays/Objects were coerced to "[object Object]" or
// "item1,item2" masking injection attempts from multi-value query parameters.
export function sanitizeQuery(value: unknown): string {
  if (typeof value !== 'string') return ''; // reject non-strings — coercion masks Array/Object injection
  return sanitize(value)
    .replace(/[\$\{\}\[\]\0|]/g, '')   // MongoDB operators + null byte + pipe
    .replace(/\.{2,}/g, '.')           // collapse repeated dots (traversal prevention)
    .slice(0, 200);
}
