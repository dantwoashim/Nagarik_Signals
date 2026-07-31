import 'server-only';

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { del, get, put } from '@vercel/blob';

import { blobCommandOptions, configuredStorageMode } from './media';

export type PrivateStagedObject = {
  storageKey: string;
  storageMode: 'blob' | 'local';
};

function stagingPrefix(): string {
  const prefix = process.env.NAGARIK_BLOB_STAGING_PREFIX ?? 'staging/local/';
  if (!/^staging\/[a-z0-9-]+\/$/.test(prefix)) {
    throw new Error('private_staging_prefix_invalid');
  }
  return prefix;
}

function localRoot(): string {
  return path.resolve(process.env.NAGARIK_DATA_DIR ?? '.data', 'private-media');
}

function safeLocalPath(storageKey: string): string {
  if (!/^[a-z0-9/_-]+\.(?:jpg|webp)$/.test(storageKey)) {
    throw new Error('private_storage_key_invalid');
  }
  const root = localRoot();
  const resolved = path.resolve(root, ...storageKey.split('/'));
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('private_storage_key_invalid');
  }
  return resolved;
}

function validPrivateStorageKey(storageKey: string): boolean {
  return (
    /^(?:staging|private)\/[a-z0-9/_-]+\.(?:jpg|webp)$/.test(storageKey) &&
    !storageKey.includes('//')
  );
}

export function newStagingStorageKey(input: {
  organizationId: string;
  mediaId: string;
  extension: 'jpg' | 'webp';
}): string {
  const organization = input.organizationId.replaceAll('-', '');
  const media = input.mediaId.replaceAll('-', '');
  if (!/^[a-f0-9]{32}$/.test(organization) || !/^[a-f0-9]{32}$/.test(media)) {
    throw new Error('private_storage_subject_invalid');
  }
  return `${stagingPrefix()}${organization}/${randomUUID().replaceAll('-', '')}/${media}.${input.extension}`;
}

export async function stagePrivateObject(input: {
  organizationId: string;
  mediaId: string;
  extension: 'jpg' | 'webp';
  mediaType: 'image/jpeg' | 'image/webp';
  bytes: Uint8Array;
}): Promise<PrivateStagedObject> {
  const storageKey = newStagingStorageKey(input);
  if (configuredStorageMode() === 'blob') {
    await put(storageKey, Buffer.from(input.bytes), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: input.mediaType,
      cacheControlMaxAge: 0,
      ...blobCommandOptions(),
    });
    return { storageKey, storageMode: 'blob' };
  }

  const target = safeLocalPath(storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, input.bytes, { flag: 'wx' });
  return { storageKey, storageMode: 'local' };
}

export async function deletePrivateObject(object: PrivateStagedObject): Promise<void> {
  if (object.storageMode === 'blob') {
    await del(object.storageKey, blobCommandOptions());
    return;
  }
  await rm(safeLocalPath(object.storageKey), { force: true });
}

async function streamBytes(
  stream: ReadableStream<Uint8Array>,
  maximumBytes: number,
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel('private_object_too_large');
        throw new Error('private_object_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    total,
  );
}

export async function readPrivateObject(
  storageKey: string,
  maximumBytes = 6 * 1024 * 1024,
): Promise<{ bytes: Buffer; contentType: string }> {
  if (!validPrivateStorageKey(storageKey)) throw new Error('private_storage_key_invalid');
  if (configuredStorageMode() === 'blob') {
    const result = await get(storageKey, {
      access: 'private',
      ...blobCommandOptions(),
    });
    if (!result || result.statusCode !== 200) throw new Error('private_object_missing');
    return {
      bytes: await streamBytes(result.stream, maximumBytes),
      contentType: result.blob.contentType,
    };
  }
  const bytes = await readFile(safeLocalPath(storageKey));
  if (bytes.byteLength > maximumBytes) throw new Error('private_object_too_large');
  return {
    bytes,
    contentType: storageKey.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
  };
}

export async function writePrivateObject(input: {
  storageKey: string;
  bytes: Uint8Array;
  contentType: 'image/jpeg' | 'image/webp';
}): Promise<PrivateStagedObject> {
  if (
    !validPrivateStorageKey(input.storageKey) ||
    !input.storageKey.startsWith(stagingPrefix().replace(/^staging\//, 'private/'))
  ) {
    throw new Error('private_storage_key_invalid');
  }
  if (configuredStorageMode() === 'blob') {
    await put(input.storageKey, Buffer.from(input.bytes), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: input.contentType,
      cacheControlMaxAge: 0,
      ...blobCommandOptions(),
    });
    return { storageKey: input.storageKey, storageMode: 'blob' };
  }
  const target = safeLocalPath(input.storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, input.bytes, { flag: 'wx' });
  return { storageKey: input.storageKey, storageMode: 'local' };
}
