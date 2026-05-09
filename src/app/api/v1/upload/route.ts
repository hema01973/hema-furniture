// src/... — HemaV050: LOW-03 fix — Sharp dimension check before Cloudinary upload
// V031: magic bytes validation (MIME type from client is spoofable)
import { NextRequest } from 'next/server';
import { uploadProductImage, deleteImage } from '@/lib/cloudinary';
import { ok, err, withErrorHandler, validateBody } from '@/lib/api';
import { requirePermission } from '@/lib/authz';
import { z } from 'zod';
import sharp from 'sharp';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

// LOW-03 FIX (V043): Maximum image dimensions to prevent decompression bombs.
// A PNG file compressed to 9.9 MB can decompress to 50–200 MB+ in memory.
// Cloudinary will also reject unreasonably large images, but we validate
// client-side first to avoid wasting bandwidth and Cloudinary processing credits.
const MAX_IMAGE_WIDTH  = 5000; // pixels
const MAX_IMAGE_HEIGHT = 5000; // pixels

// ── Magic bytes for each allowed image format ─────────────────────
// file.type (Content-Type) is set by the browser/client — trivially spoofable.
// Reading the first bytes of the actual buffer is reliable regardless of what
// the client claims the file is.
const MAGIC: Array<{ format: string; check: (b: Buffer) => boolean }> = [
  {
    format: 'JPEG',
    check:  b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
  },
  {
    format: 'PNG',
    check:  b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47,
  },
  {
    format: 'WebP',
    // RIFF....WEBP
    check:  b => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
              && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  {
    format: 'AVIF',
    // ftyp box with 'avif' or 'avis' brand (bytes 4-7 = 'ftyp', 8-11 = brand)
    check:  b => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70
              && (
                   (b[8] === 0x61 && b[9] === 0x76 && b[10] === 0x69 && b[11] === 0x66) || // avif
                   (b[8] === 0x61 && b[9] === 0x76 && b[10] === 0x69 && b[11] === 0x73)    // avis
                 ),
  },
];

function detectImageFormat(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  for (const { format, check } of MAGIC) {
    if (check(buffer)) return format;
  }
  return null;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await requirePermission(req, 'upload:file');
  if (!auth.ok) return auth.response;
  {
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY    ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      return err(
        'Image upload is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
        503,
      );
    }

    const formData = await req.formData();
    const files    = formData.getAll('files') as File[];
    const single   = formData.get('file') as File | null;
    const toUpload = single ? [single] : files;

    if (!toUpload.length)    return err('No files provided', 400);
    if (toUpload.length > 10) return err('Maximum 10 files per upload', 400);

    const results = await Promise.all(
      toUpload.map(async file => {
        if (file.size === 0)        throw new Error(`${file.name}: File is empty.`);
        if (file.size > MAX_SIZE)   throw new Error(`${file.name}: File too large (max 10 MB).`);

        const buffer = Buffer.from(await file.arrayBuffer());

        // ── Magic bytes check — client-supplied MIME type is ignored ──
        const detectedFormat = detectImageFormat(buffer);
        if (!detectedFormat) {
          throw new Error(
            `${file.name}: Not a recognized image. Allowed formats: JPEG, PNG, WebP, AVIF.`,
          );
        }

        // LOW-03 FIX (V043): Dimension check via Sharp to prevent decompression bombs.
        // A heavily-compressed PNG can decompress to hundreds of MB in memory.
        // We read only the image metadata (no full decode) for performance.
        const meta = await sharp(buffer).metadata();
        const w = meta.width  ?? 0;
        const h = meta.height ?? 0;
        if (w > MAX_IMAGE_WIDTH || h > MAX_IMAGE_HEIGHT) {
          throw new Error(
            `${file.name}: Image dimensions ${w}×${h}px exceed the maximum ` +
            `${MAX_IMAGE_WIDTH}×${MAX_IMAGE_HEIGHT}px. Please resize before uploading.`,
          );
        }

        return uploadProductImage(buffer);
      }),
    );

    return ok({ urls: results.map(r => r.url), results });
  }
}, { rateMax: 20, rateWindow: 60 }); // V010 (W3): 20/min upload cap

const DeleteSchema = z.object({
  // Cloudinary public IDs: alphanumeric + hyphens + slashes + dots (folder/name.ext)
  // Max ~255 chars in practice; cap at 300 to be safe
  publicId: z.string()
              .min(1, 'publicId is required')
              .max(300)
              .regex(/^[a-zA-Z0-9_\-./]+$/, 'Invalid publicId format'),
});
// V011: P2-01 — removed misleading rate-limit options on z.object() (silently
// ignored). The DELETE handler below already applies { rateMax: 20, rateWindow: 60 }
// via withErrorHandler() — that's the only place rate limiting actually runs.

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  // V005: only roles holding `delete:product` (admin only by default) may
  // delete uploaded images, since they live attached to product records.
  const auth = await requirePermission(req, 'delete:product');
  if (!auth.ok) return auth.response;
  const v = await validateBody(req, DeleteSchema);
  if ('error' in v) return v.error;
  await deleteImage(v.data.publicId);
  return ok({ message: 'Image deleted' });
}, { rateMax: 20, rateWindow: 60 }); // V010 (W3): 20/min upload cap
