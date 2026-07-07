import 'server-only';

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { uploadDir } from '../server/paths';
import { sanitizeImage } from './sanitizeImage';

export async function prepareUpload(file: File) {
  const sanitized = await sanitizeImage(file);
  const directory = uploadDir();
  mkdirSync(directory, { recursive: true });
  const fileName = `${sanitized.evidenceHash.slice(0, 16)}.${sanitized.extension}`;
  const path = resolve(directory, fileName);
  writeFileSync(path, sanitized.bytes);
  return {
    fileName,
    originalFileName: sanitized.fileName,
    mediaType: sanitized.mediaType,
    originalSize: sanitized.originalSize,
    sanitizedSize: sanitized.sanitizedSize,
    width: sanitized.width,
    height: sanitized.height,
    evidenceHash: sanitized.evidenceHash,
    photoUrl: `/uploads/${fileName}`,
    storageMode: 'local_public_uploads',
    exifStripped: sanitized.exifStripped,
    compressed: sanitized.compressed,
  };
}
