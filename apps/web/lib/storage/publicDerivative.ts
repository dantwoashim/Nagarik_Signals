import { createHash } from 'node:crypto';

import sharp from 'sharp';

import { maxImagePixels, maxSanitizedBytes, normalizationVersion } from './normalizeImage';

export const publicDerivativeVersion = 'public-derivative-v1';
export const maxPublicLongestSide = 1_600;

export type RedactionReason =
  'face' | 'license_plate' | 'personal_detail' | 'private_document' | 'other_sensitive';

export type SourceRedactionRectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
  reasonCode: RedactionReason;
};

export type PublicDerivative = {
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/webp';
  extension: 'jpg' | 'webp';
  width: number;
  height: number;
  byteLength: number;
  sha256: string;
  manifest: {
    transformVersion: typeof publicDerivativeVersion;
    normalizationVersion: typeof normalizationVersion;
    source: {
      mediaId: string;
      sha256: string;
      width: number;
      height: number;
    };
    rectangles: SourceRedactionRectangle[];
    output: {
      sha256: string;
      width: number;
      height: number;
      byteLength: number;
      mimeType: 'image/jpeg' | 'image/webp';
    };
  };
};

function sortedRectangles(
  rectangles: readonly SourceRedactionRectangle[],
  sourceWidth: number,
  sourceHeight: number,
): SourceRedactionRectangle[] {
  if (rectangles.length > 32) throw new Error('redaction_rectangle_limit_exceeded');
  const normalized = rectangles.map((rectangle) => {
    const values = [rectangle.x, rectangle.y, rectangle.width, rectangle.height];
    if (
      values.some((value) => !Number.isInteger(value)) ||
      rectangle.x < 0 ||
      rectangle.y < 0 ||
      rectangle.width <= 0 ||
      rectangle.height <= 0 ||
      rectangle.x + rectangle.width > sourceWidth ||
      rectangle.y + rectangle.height > sourceHeight
    ) {
      throw new Error('redaction_rectangle_invalid');
    }
    return { ...rectangle };
  });
  return normalized.sort(
    (left, right) =>
      left.y - right.y ||
      left.x - right.x ||
      left.height - right.height ||
      left.width - right.width,
  );
}

function scaledRectangle(
  rectangle: SourceRedactionRectangle,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
) {
  const left = Math.max(0, Math.floor((rectangle.x * outputWidth) / sourceWidth));
  const top = Math.max(0, Math.floor((rectangle.y * outputHeight) / sourceHeight));
  const right = Math.min(
    outputWidth,
    Math.ceil(((rectangle.x + rectangle.width) * outputWidth) / sourceWidth),
  );
  const bottom = Math.min(
    outputHeight,
    Math.ceil(((rectangle.y + rectangle.height) * outputHeight) / sourceHeight),
  );
  return { left, top, width: right - left, height: bottom - top };
}

export async function renderPublicDerivative(input: {
  sourceMediaId: string;
  sourceSha256: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceMimeType: 'image/jpeg' | 'image/webp';
  sourceBytes: Uint8Array;
  rectangles: readonly SourceRedactionRectangle[];
}): Promise<PublicDerivative> {
  const sourceBytes = Buffer.from(input.sourceBytes);
  if (createHash('sha256').update(sourceBytes).digest('hex') !== input.sourceSha256) {
    throw new Error('derivative_source_hash_mismatch');
  }

  const source = sharp(sourceBytes, {
    failOn: 'error',
    limitInputPixels: maxImagePixels,
    pages: 1,
    sequentialRead: true,
  });
  const metadata = await source.metadata();
  if (
    metadata.width !== input.sourceWidth ||
    metadata.height !== input.sourceHeight ||
    (input.sourceMimeType === 'image/jpeg' && metadata.format !== 'jpeg') ||
    (input.sourceMimeType === 'image/webp' && metadata.format !== 'webp')
  ) {
    throw new Error('derivative_source_metadata_mismatch');
  }

  const rectangles = sortedRectangles(input.rectangles, input.sourceWidth, input.sourceHeight);
  const resized = await sharp(sourceBytes, {
    failOn: 'error',
    limitInputPixels: maxImagePixels,
    pages: 1,
    sequentialRead: true,
  })
    .toColourspace('srgb')
    .resize({
      width: maxPublicLongestSide,
      height: maxPublicLongestSide,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const overlays = rectangles
    .map((rectangle) =>
      scaledRectangle(
        rectangle,
        input.sourceWidth,
        input.sourceHeight,
        resized.info.width,
        resized.info.height,
      ),
    )
    .filter((rectangle) => rectangle.width > 0 && rectangle.height > 0)
    .map((rectangle) => ({
      input: {
        create: {
          width: rectangle.width,
          height: rectangle.height,
          channels: 4 as const,
          background: { r: 32, g: 36, b: 42, alpha: 1 },
        },
      },
      left: rectangle.left,
      top: rectangle.top,
    }));

  let encoder = sharp(resized.data, {
    raw: {
      width: resized.info.width,
      height: resized.info.height,
      channels: 4,
    },
  }).composite(overlays);
  encoder =
    input.sourceMimeType === 'image/webp'
      ? encoder.webp({ lossless: true, effort: 6 })
      : encoder.jpeg({
          quality: 82,
          chromaSubsampling: '4:2:0',
          progressive: true,
          optimizeCoding: true,
        });
  const result = await encoder.toBuffer({ resolveWithObject: true });
  if (result.data.byteLength > maxSanitizedBytes) {
    throw new Error('public_derivative_too_large');
  }

  const mimeType = input.sourceMimeType;
  const sha256 = createHash('sha256').update(result.data).digest('hex');
  return {
    bytes: result.data,
    mimeType,
    extension: mimeType === 'image/webp' ? 'webp' : 'jpg',
    width: result.info.width,
    height: result.info.height,
    byteLength: result.data.byteLength,
    sha256,
    manifest: {
      transformVersion: publicDerivativeVersion,
      normalizationVersion,
      source: {
        mediaId: input.sourceMediaId,
        sha256: input.sourceSha256,
        width: input.sourceWidth,
        height: input.sourceHeight,
      },
      rectangles,
      output: {
        sha256,
        width: result.info.width,
        height: result.info.height,
        byteLength: result.data.byteLength,
        mimeType,
      },
    },
  };
}
