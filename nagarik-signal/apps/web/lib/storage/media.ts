import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { get } from '@vercel/blob';
import { uploadDir } from '../server/paths';
import {
  blobPathForMedia,
  configuredStorageMode,
  isValidMediaFileName,
  mediaTypeForFile,
  MediaStorageConfigurationError,
} from './mediaConfig';

export {
  blobPathForMedia,
  configuredStorageMode,
  isValidMediaFileName,
  mediaTypeForFile,
  MediaStorageConfigurationError,
  privateMediaCacheControl,
} from './mediaConfig';

export function blobCommandOptions() {
  const token = process.env.NAGARIK_BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  const storeId = process.env.NAGARIK_BLOB_STORE_ID ?? process.env.BLOB_STORE_ID;
  if (!token && !(oidcToken && storeId)) {
    throw new MediaStorageConfigurationError(
      'blob_credentials_missing: set BLOB_READ_WRITE_TOKEN or VERCEL_OIDC_TOKEN with BLOB_STORE_ID'
    );
  }
  return {
    ...(token ? { token } : {}),
    ...(oidcToken && storeId ? { oidcToken, storeId } : {}),
  };
}

function quotedEtag(fileName: string) {
  return `"${fileName.split('.')[0].toLowerCase()}"`;
}

function normalizeEtag(etag: string) {
  return etag.startsWith('"') || etag.startsWith('W/"') ? etag : `"${etag}"`;
}

function etagMatches(ifNoneMatch: string | null, etag: string) {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(',').some((candidate) => {
    const normalized = candidate.trim().replace(/^W\//, '');
    return normalized === '*' || normalized === etag;
  });
}

export type StoredMedia =
  | {
      status: 200;
      body: ReadableStream<Uint8Array> | Uint8Array;
      contentType: string;
      contentLength: number;
      etag: string;
      source: 'local' | 'vercel_blob_private';
    }
  | {
      status: 304;
      body: null;
      contentType: string;
      contentLength: null;
      etag: string;
      source: 'local' | 'vercel_blob_private';
    };

export async function readStoredMedia(
  fileName: string,
  ifNoneMatch: string | null = null
): Promise<StoredMedia | null> {
  if (!isValidMediaFileName(fileName)) throw new Error('invalid_media_name');

  if (configuredStorageMode() === 'blob') {
    const result = await get(blobPathForMedia(fileName), {
      access: 'private',
      ifNoneMatch: ifNoneMatch ?? undefined,
      ...blobCommandOptions(),
    });
    if (!result) return null;
    if (result.statusCode === 304) {
      return {
        status: 304,
        body: null,
        contentType: mediaTypeForFile(fileName),
        contentLength: null,
        etag: normalizeEtag(result.blob.etag),
        source: 'vercel_blob_private',
      };
    }
    return {
      status: 200,
      body: result.stream,
      contentType: result.blob.contentType || mediaTypeForFile(fileName),
      contentLength: result.blob.size,
      etag: normalizeEtag(result.blob.etag),
      source: 'vercel_blob_private',
    };
  }

  const etag = quotedEtag(fileName);
  if (etagMatches(ifNoneMatch, etag)) {
    return {
      status: 304,
      body: null,
      contentType: mediaTypeForFile(fileName),
      contentLength: null,
      etag,
      source: 'local',
    };
  }
  try {
    const bytes = await readFile(resolve(uploadDir(), fileName));
    return {
      status: 200,
      body: new Uint8Array(bytes),
      contentType: mediaTypeForFile(fileName),
      contentLength: bytes.byteLength,
      etag,
      source: 'local',
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
