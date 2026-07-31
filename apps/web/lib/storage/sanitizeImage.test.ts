import assert from 'node:assert/strict';
import test from 'node:test';

import sharp from 'sharp';

import { maxPrivateLongestSide, normalizationVersion, sanitizeImage } from './normalizeImage';

test('image-v2 emits deterministic metadata-free JPEG without enlargement', async () => {
  const input = await sharp({
    create: {
      width: 80,
      height: 60,
      channels: 3,
      background: { r: 18, g: 90, b: 140 },
    },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const file = new File([input], 'private-name.jpg', { type: 'image/jpeg' });

  const first = await sanitizeImage(file);
  const second = await sanitizeImage(file);
  const metadata = await sharp(first.bytes).metadata();

  assert.equal(first.normalizationVersion, normalizationVersion);
  assert.equal(first.mediaType, 'image/jpeg');
  assert.equal(first.evidenceHash, second.evidenceHash);
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.width, 60);
  assert.equal(first.height, 80);
  assert.equal(metadata.orientation, undefined);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.comments, undefined);
  assert.ok(Math.max(first.width, first.height) <= maxPrivateLongestSide);
});

test('image-v2 preserves alpha through lossless WebP and rejects mismatched formats', async () => {
  const transparent = await sharp({
    create: {
      width: 24,
      height: 24,
      channels: 4,
      background: { r: 20, g: 30, b: 40, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();

  const result = await sanitizeImage(
    new File([transparent], 'evidence.png', { type: 'image/png' }),
  );
  assert.equal(result.mediaType, 'image/webp');
  assert.equal((await sharp(result.bytes).metadata()).hasAlpha, true);

  await assert.rejects(
    sanitizeImage(new File([transparent], 'evidence.gif', { type: 'image/gif' })),
    /unsupported_image/,
  );
});
