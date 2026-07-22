import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MediaStorageConfigurationError,
  blobPathForMedia,
  configuredStorageMode,
  isValidMediaFileName,
  mediaTypeForFile,
  privateMediaCacheControl,
} from './mediaConfig';

test('media names remain content-addressed and path-safe', () => {
  assert.equal(isValidMediaFileName('0123456789abcdef.webp'), true);
  assert.equal(isValidMediaFileName(`${'a'.repeat(64)}.webp`), true);
  assert.equal(isValidMediaFileName(`${'a'.repeat(32)}.webp`), false);
  assert.equal(isValidMediaFileName('../0123456789abcdef.webp'), false);
  assert.equal(isValidMediaFileName('0123456789abcdef.svg'), false);
  assert.equal(blobPathForMedia('0123456789abcdef.png'), 'media/0123456789abcdef.png');
  assert.equal(mediaTypeForFile('0123456789abcdef.jpg'), 'image/jpeg');
  assert.equal(privateMediaCacheControl, 'private, no-store, max-age=0');
});

test('storage mode rejects configuration typos instead of silently using local disk', () => {
  const previous = process.env.NAGARIK_STORAGE_MODE;
  process.env.NAGARIK_STORAGE_MODE = 'blbo';
  try {
    assert.throws(() => configuredStorageMode(), MediaStorageConfigurationError);
  } finally {
    if (previous === undefined) delete process.env.NAGARIK_STORAGE_MODE;
    else process.env.NAGARIK_STORAGE_MODE = previous;
  }
});
