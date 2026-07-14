export const privateMediaCacheControl = 'private, no-store, max-age=0';

const mediaTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export class MediaStorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaStorageConfigurationError';
  }
}

export function isValidMediaFileName(fileName: string) {
  return /^(?:[a-f0-9]{16}|[a-f0-9]{64})\.(jpg|jpeg|png|webp)$/i.test(fileName);
}

export function mediaTypeForFile(fileName: string) {
  const extension = fileName.split('.').at(-1)?.toLowerCase() ?? '';
  return mediaTypes[extension] ?? 'application/octet-stream';
}

export function configuredStorageMode(): 'local' | 'blob' {
  const mode = (process.env.NAGARIK_STORAGE_MODE ?? 'local').trim().toLowerCase();
  if (mode === 'local' || mode === 'filesystem') return 'local';
  if (mode === 'blob') return 'blob';
  throw new MediaStorageConfigurationError(`unsupported_NAGARIK_STORAGE_MODE_${mode || 'empty'}`);
}

export function blobPathForMedia(fileName: string) {
  if (!isValidMediaFileName(fileName)) throw new Error('invalid_media_name');
  return `media/${fileName}`;
}
