import 'server-only';

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { put } from '@vercel/blob';
import { uploadDir } from '../server/paths';
import { blobCommandOptions, blobPathForMedia, configuredStorageMode } from './media';
import { sanitizeImage } from './sanitizeImage';

export async function prepareUpload(file: File) {
  const sanitized = await sanitizeImage(file);
  const fileName = `${sanitized.evidenceHash}.${sanitized.extension}`;
  const storageMode = configuredStorageMode();

  if (storageMode === 'blob') {
    await put(blobPathForMedia(fileName), sanitized.bytes, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: sanitized.mediaType,
      cacheControlMaxAge: 31_536_000,
      ...blobCommandOptions(),
    });
  } else {
    const directory = uploadDir();
    mkdirSync(directory, { recursive: true });
    const path = resolve(directory, fileName);
    writeFileSync(path, sanitized.bytes);
  }

  return {
    fileName,
    originalFileName: sanitized.fileName,
    mediaType: sanitized.mediaType,
    originalSize: sanitized.originalSize,
    sanitizedSize: sanitized.sanitizedSize,
    width: sanitized.width,
    height: sanitized.height,
    evidenceHash: sanitized.evidenceHash,
    photoUrl: `/api/media/${fileName}`,
    storageMode: storageMode === 'blob'
      ? 'vercel_blob_private'
      : process.env.NAGARIK_DATA_DIR || process.env.NAGARIK_UPLOAD_DIR
        ? 'persistent_data_directory'
        : 'local_public_uploads',
    exifStripped: sanitized.exifStripped,
    compressed: sanitized.compressed,
  };
}
