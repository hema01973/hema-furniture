// src/lib/cloudinary.ts
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

export interface UploadResult {
  url:       string;
  publicId:  string;
  width:     number;
  height:    number;
  format:    string;
  bytes:     number;
}

/**
 * Upload a file buffer to Cloudinary
 */
export async function uploadImage(
  buffer: Buffer,
  folder = 'hema-furniture',
  options: Record<string, unknown> = {}
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder,
        quality:      'auto',
        fetch_format: 'auto',
        ...options,
      },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error('Upload failed'));
        resolve({
          url:      result.secure_url,
          publicId: result.public_id,
          width:    result.width,
          height:   result.height,
          format:   result.format,
          bytes:    result.bytes,
        });
      }
    ).end(buffer);
  });
}

/**
 * Upload a product image with transformations
 */
export async function uploadProductImage(buffer: Buffer): Promise<UploadResult> {
  return uploadImage(buffer, 'hema-furniture/products', {
    transformation: [
      { width: 1200, height: 1200, crop: 'limit' },
      { quality: 'auto:good' },
    ],
  });
}

/**
 * Delete an image from Cloudinary
 */
export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}

/**
 * Get optimized image URL with transformations
 */
export function getOptimizedUrl(
  publicId: string,
  width = 800,
  height = 800
): string {
  return cloudinary.url(publicId, {
    width,
    height,
    crop:         'fill',
    quality:      'auto',
    fetch_format: 'auto',
  });
}

export default cloudinary;
