import 'server-only';

import sharp from 'sharp';
import { sha256Hex } from '../proof/hash';

export const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const maxUploadBytes = 8 * 1024 * 1024;

function extensionFor(mediaType: string) {
  if (mediaType === 'image/jpeg') return 'jpg';
  if (mediaType === 'image/png') return 'png';
  if (mediaType === 'image/webp') return 'webp';
  return 'bin';
}

export async function sanitizeImage(file: File) {
  if (!allowedImageTypes.has(file.type)) {
    throw new Error('unsupported_image_type');
  }
  if (file.size <= 0) throw new Error('empty_file');
  if (file.size > maxUploadBytes) throw new Error('file_too_large');

  const input = Buffer.from(await file.arrayBuffer());
  const image = sharp(input, { failOn: 'error' }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error('invalid_image');

  let sanitized: Buffer;
  if (file.type === 'image/png') {
    sanitized = await image.png({ compressionLevel: 9, palette: true }).toBuffer();
  } else if (file.type === 'image/webp') {
    sanitized = await image.webp({ quality: 82 }).toBuffer();
  } else {
    sanitized = await image.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  }

  const evidenceHash = await sha256Hex(sanitized);
  return {
    fileName: file.name,
    mediaType: file.type,
    extension: extensionFor(file.type),
    originalSize: file.size,
    sanitizedSize: sanitized.length,
    width: metadata.width,
    height: metadata.height,
    bytes: sanitized,
    evidenceHash,
    exifStripped: true,
    compressed: true,
  };
}
