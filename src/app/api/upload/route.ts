// src/app/api/upload/route.ts
import { NextRequest } from 'next/server';
import { uploadProductImage, deleteImage } from '@/lib/cloudinary';
import { ok, err, withErrorHandler, withAuth } from '@/lib/api';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED  = ['image/jpeg','image/png','image/webp','image/avif'];

export const POST = withErrorHandler(async (req: NextRequest) => {
  return withAuth(req, async () => {
    const formData = await req.formData();
    const files    = formData.getAll('files') as File[];
    const single   = formData.get('file') as File | null;
    const toUpload = single ? [single] : files;

    if (!toUpload.length) return err('No files provided', 400);
    if (toUpload.length > 10) return err('Maximum 10 files per upload', 400);

    const results = await Promise.all(
      toUpload.map(async file => {
        if (!ALLOWED.includes(file.type))
          throw new Error(`${file.name}: Unsupported type. Use JPEG, PNG, or WebP.`);
        if (file.size > MAX_SIZE)
          throw new Error(`${file.name}: File too large. Max 10MB.`);

        const buffer = Buffer.from(await file.arrayBuffer());
        return uploadProductImage(buffer);
      })
    );

    return ok({ urls: results.map(r => r.url), results });
  }, ['admin', 'staff']);
});

// DELETE /api/upload — delete an image from Cloudinary
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  return withAuth(req, async () => {
    const { publicId } = await req.json();
    if (!publicId) return err('publicId is required', 400);
    await deleteImage(publicId);
    return ok({ message: 'Image deleted' });
  }, ['admin']);
});

