import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  get,
  head,
  put,
} from '@vercel/blob';

export type DurableStorageMode = 'local_json' | 'vercel_blob';

type StoreSnapshot<T> = {
  value: T;
  etag: string | null;
};

type JsonStoreOptions<T> = {
  localPath: () => string;
  blobPath: () => string;
  create: () => T;
  normalize: (value: unknown, mode: DurableStorageMode) => T;
  prepareForWrite?: (value: T, mode: DurableStorageMode) => T;
};

let localOperationTail: Promise<void> = Promise.resolve();
const blobOperationTails = new Map<string, Promise<void>>();

function configuredMode(): DurableStorageMode {
  const configured = process.env.NAGARIK_STORAGE_MODE?.trim().toLowerCase();
  if (!configured || configured === 'local' || configured === 'local_json') return 'local_json';
  if (configured === 'blob' || configured === 'vercel_blob') return 'vercel_blob';
  throw new Error(`unsupported_nagarik_storage_mode:${configured}`);
}

function retryCount() {
  const parsed = Number.parseInt(process.env.NAGARIK_BLOB_WRITE_RETRIES ?? '', 10);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(Math.max(parsed, 2), 10);
}

function serialize(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseStoredJson<T>(raw: string, source: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`invalid_json_in_durable_store:${source}`, { cause: error });
  }
}

function strongEtag(etag: string) {
  return etag.startsWith('W/') ? etag.slice(2) : etag;
}

async function withLocalLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = localOperationTail;
  let release!: () => void;
  localOperationTail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

async function withBlobProcessLock<T>(pathname: string, operation: () => Promise<T>): Promise<T> {
  const previous = blobOperationTails.get(pathname) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  blobOperationTails.set(pathname, current);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (blobOperationTails.get(pathname) === current) blobOperationTails.delete(pathname);
  }
}

async function localSnapshot<T>(path: string): Promise<StoreSnapshot<T> | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return { value: parseStoredJson<T>(raw, path), etag: null };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function writeLocal(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, serialize(value), 'utf8');
  try {
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function blobSnapshot<T>(pathname: string): Promise<StoreSnapshot<T> | null> {
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result) return null;
  if (result.statusCode !== 200 || !result.stream) {
    throw new Error(`unexpected_blob_read_status:${result.statusCode}`);
  }

  const raw = await new Response(result.stream).text();
  return {
    value: parseStoredJson<T>(raw, pathname),
    // Large private downloads currently expose the same object hash as a weak
    // ETag, while conditional writes require its strong representation.
    etag: strongEtag(result.blob.etag),
  };
}

async function writeBlob(pathname: string, value: unknown, etag: string | null) {
  return put(pathname, serialize(value), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: etag !== null,
    cacheControlMaxAge: 60,
    contentType: 'application/json',
    ifMatch: etag ?? undefined,
  });
}

function isWriteConflict(error: unknown) {
  return error instanceof BlobPreconditionFailedError;
}

async function conflictBackoff(attempt: number) {
  const exponentialMs = Math.min(25 * 2 ** attempt, 400);
  const jitterMs = Math.floor(Math.random() * 25);
  await new Promise((resolve) => setTimeout(resolve, exponentialMs + jitterMs));
}

export function createJsonStore<T>(options: JsonStoreOptions<T>) {
  const prepare = (value: T, mode: DurableStorageMode) =>
    options.prepareForWrite ? options.prepareForWrite(value, mode) : value;

  async function readLocal(): Promise<T> {
    return withLocalLock(async () => {
      const path = options.localPath();
      const existing = await localSnapshot<unknown>(path);
      if (existing) return options.normalize(existing.value, 'local_json');

      const created = prepare(options.normalize(options.create(), 'local_json'), 'local_json');
      await writeLocal(path, created);
      return created;
    });
  }

  async function readBlob(): Promise<T> {
    const pathname = options.blobPath();
    const existing = await blobSnapshot<unknown>(pathname);
    if (existing) return options.normalize(existing.value, 'vercel_blob');

    const created = prepare(options.normalize(options.create(), 'vercel_blob'), 'vercel_blob');
    try {
      await writeBlob(pathname, created, null);
      return created;
    } catch (error) {
      // A concurrent initializer may have created the fixed pathname first.
      const winner = await blobSnapshot<unknown>(pathname);
      if (winner) return options.normalize(winner.value, 'vercel_blob');
      throw error;
    }
  }

  async function mutateLocal<R>(mutation: (model: T) => R): Promise<R> {
    return withLocalLock(async () => {
      const path = options.localPath();
      const existing = await localSnapshot<unknown>(path);
      const model = options.normalize(existing?.value ?? options.create(), 'local_json');
      const result = mutation(model);
      await writeLocal(path, prepare(model, 'local_json'));
      return result;
    });
  }

  async function mutateBlob<R>(pathname: string, mutation: (model: T) => R): Promise<R> {
    const attempts = retryCount();
    let lastConflict: unknown = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const existing = await blobSnapshot<unknown>(pathname);
      const model = options.normalize(existing?.value ?? options.create(), 'vercel_blob');
      const result = mutation(model);

      try {
        await writeBlob(pathname, prepare(model, 'vercel_blob'), existing?.etag ?? null);
        return result;
      } catch (error) {
        let conflict = isWriteConflict(error);
        if (!existing) {
          // Blob creation conflicts are not consistently surfaced as ETag errors.
          conflict = conflict || Boolean(await blobSnapshot<unknown>(pathname));
        }
        if (!conflict) throw error;

        lastConflict = error;
        if (attempt + 1 < attempts) await conflictBackoff(attempt);
      }
    }

    throw new Error(`blob_write_conflict_after_${attempts}_attempts`, { cause: lastConflict });
  }

  return {
    mode: configuredMode,

    async exists() {
      if (configuredMode() === 'local_json') {
        try {
          await stat(options.localPath());
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
          throw error;
        }
      }

      try {
        await head(options.blobPath());
        return true;
      } catch (error) {
        if (error instanceof BlobNotFoundError) return false;
        throw error;
      }
    },

    async read() {
      return configuredMode() === 'vercel_blob' ? readBlob() : readLocal();
    },

    async mutate<R>(mutation: (model: T) => R) {
      if (configuredMode() === 'vercel_blob') {
        const pathname = options.blobPath();
        return withBlobProcessLock(pathname, () => mutateBlob(pathname, mutation));
      }
      return mutateLocal(mutation);
    },
  };
}
