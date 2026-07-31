import sharp, { type Metadata, type OutputInfo } from 'sharp';

import { sha256Hex } from '../proof/hash';

export const normalizationVersion = 'image-v2';
export const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const maxUploadBytes = 10 * 1024 * 1024;
export const maxImagePixels = 25_000_000;
export const maxPrivateLongestSide = 4_096;
export const maxSanitizedBytes = 6 * 1024 * 1024;

type NormalizedImage = {
  normalizationVersion: typeof normalizationVersion;
  mediaType: 'image/jpeg' | 'image/webp';
  extension: 'jpg' | 'webp';
  originalSize: number;
  sanitizedSize: number;
  width: number;
  height: number;
  bytes: Buffer;
  evidenceHash: string;
};

function stableUploadError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith('Input image exceeds pixel limit')) {
    return new Error('decoded_image_too_large');
  }
  return new Error('malformed_image');
}

export async function sanitizeImage(file: File): Promise<NormalizedImage> {
  if (!allowedImageTypes.has(file.type)) throw new Error('unsupported_image');
  if (file.size <= 0) throw new Error('upload_missing');
  if (file.size > maxUploadBytes) throw new Error('upload_too_large');

  const input = Buffer.from(await file.arrayBuffer());
  let metadata: Metadata;
  try {
    metadata = await sharp(input, {
      failOn: 'error',
      limitInputPixels: maxImagePixels,
      pages: 2,
      sequentialRead: true,
    }).metadata();
  } catch (error) {
    throw stableUploadError(error);
  }

  if (!metadata.width || !metadata.height) throw new Error('malformed_image');
  if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) {
    throw new Error('unsupported_image');
  }
  if ((metadata.pages ?? 1) !== 1) throw new Error('animated_or_multipage_image');
  if (metadata.width * metadata.height > maxImagePixels) {
    throw new Error('decoded_image_too_large');
  }

  const hasAlpha = metadata.hasAlpha === true;
  let pipeline = sharp(input, {
    failOn: 'error',
    limitInputPixels: maxImagePixels,
    pages: 1,
    sequentialRead: true,
  })
    .rotate()
    .toColourspace('srgb')
    .resize({
      width: maxPrivateLongestSide,
      height: maxPrivateLongestSide,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    });

  pipeline = hasAlpha
    ? pipeline.webp({ lossless: true, effort: 6 })
    : pipeline.jpeg({
        quality: 82,
        chromaSubsampling: '4:2:0',
        progressive: true,
        optimizeCoding: true,
      });

  let result: { data: Buffer; info: OutputInfo };
  try {
    result = await pipeline.toBuffer({ resolveWithObject: true });
  } catch (error) {
    throw stableUploadError(error);
  }
  if (result.data.byteLength > maxSanitizedBytes) {
    throw new Error('normalized_image_too_large');
  }

  return {
    normalizationVersion,
    mediaType: hasAlpha ? 'image/webp' : 'image/jpeg',
    extension: hasAlpha ? 'webp' : 'jpg',
    originalSize: file.size,
    sanitizedSize: result.data.byteLength,
    width: result.info.width,
    height: result.info.height,
    bytes: result.data,
    evidenceHash: await sha256Hex(result.data),
  };
}
