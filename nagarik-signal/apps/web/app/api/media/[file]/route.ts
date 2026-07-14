import { NextResponse } from 'next/server';
import {
  isValidMediaFileName,
  MediaStorageConfigurationError,
  privateMediaCacheControl,
  readStoredMedia,
} from '@/lib/storage/media';
import { mediaDisplayAllowed } from '@/lib/db/queries';

export const runtime = 'nodejs';

function asResponseBody(body: ReadableStream<Uint8Array> | Uint8Array): BodyInit {
  if (body instanceof ReadableStream) return body;
  const buffer = new ArrayBuffer(body.byteLength);
  new Uint8Array(buffer).set(body);
  return buffer;
}

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!isValidMediaFileName(file)) {
    return NextResponse.json({ ok: false, error: 'invalid_media_name' }, { status: 400 });
  }

  if (!(await mediaDisplayAllowed(`/api/media/${file}`))) {
    return NextResponse.json({ ok: false, error: 'media_hidden_by_safety_review' }, { status: 451 });
  }

  try {
    const media = await readStoredMedia(file, request.headers.get('if-none-match'));
    if (!media) {
      return NextResponse.json({ ok: false, error: 'media_not_found' }, { status: 404 });
    }
    const headers = {
      'Cache-Control': privateMediaCacheControl,
      'Content-Disposition': 'inline',
      'Content-Type': media.contentType,
      ETag: media.etag,
      'X-Content-Type-Options': 'nosniff',
      'X-Nagarik-Media-Source': media.source,
      ...(media.contentLength === null ? {} : { 'Content-Length': String(media.contentLength) }),
    };
    if (media.status === 304) return new Response(null, { status: 304, headers });
    return new Response(asResponseBody(media.body), {
      headers: {
        ...headers,
      },
    });
  } catch (error) {
    const configurationError = error instanceof MediaStorageConfigurationError;
    return NextResponse.json(
      { ok: false, error: configurationError ? error.message : 'media_storage_unavailable' },
      { status: 503 }
    );
  }
}
