// src/... — HemaV050: secrets via adapter, lazy config
import { v2 as cloudinary } from 'cloudinary';
import { withCircuitBreaker } from '@/lib/circuit-breaker';
import { logger } from '@/lib/logger';
import { getSecretSync } from '@/lib/secrets';

// V010: Cloudinary's `config` is set at module load. We still source the
// values via the secrets adapter so a Vault rotation reflected in cache
// is picked up the next time the module is reloaded (HMR / cold start).
cloudinary.config({
  cloud_name: getSecretSync('CLOUDINARY_CLOUD_NAME'),
  api_key:    getSecretSync('CLOUDINARY_API_KEY'),
  api_secret: getSecretSync('CLOUDINARY_API_SECRET'),
  secure:     true,
});

export interface UploadResult {
  url: string; publicId: string;
  width: number; height: number;
  format: string; bytes: number;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY    &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function uploadStream(buffer: Buffer, options: Record<string, unknown>): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err || !result) {
        reject(err ?? new Error('Cloudinary upload returned no result'));
        return;
      }
      resolve({
        url:      result.secure_url,
        publicId: result.public_id,
        width:    result.width,
        height:   result.height,
        format:   result.format,
        bytes:    result.bytes,
      });
    });
    stream.end(buffer);
  });
}

export async function uploadImage(
  buffer:  Buffer,
  folder   = 'hema-furniture',
  options: Record<string, unknown> = {},
): Promise<UploadResult> {
  return withCircuitBreaker('cloudinary', () =>
    uploadStream(buffer, { folder, quality: 'auto', fetch_format: 'auto', ...options }),
    { failureThreshold: 3, timeout: 60_000 }
  );
}

export async function uploadProductImage(buffer: Buffer): Promise<UploadResult> {
  const result = await uploadImage(buffer, 'hema-furniture/products', {
    transformation: [
      { width: 1200, height: 1200, crop: 'limit' },
      { quality: 'auto:good' },
    ],
  });
  logger.info('[Cloudinary] Product image uploaded', {
    publicId: result.publicId,
    bytes:    result.bytes,
  });
  return result;
}

export async function deleteImage(publicId: string): Promise<void> {
  await withCircuitBreaker('cloudinary', () =>
    cloudinary.uploader.destroy(publicId) as Promise<unknown>,
    { failureThreshold: 3, timeout: 60_000 }
  );
  logger.info('[Cloudinary] Image deleted', { publicId });
}

export function getOptimizedUrl(publicId: string, width = 800, height = 800): string {
  return cloudinary.url(publicId, {
    width, height, crop: 'fill',
    quality: 'auto', fetch_format: 'auto',
  });
}

export default cloudinary;
