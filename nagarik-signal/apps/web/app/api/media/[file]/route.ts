import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { uploadDir } from '@/lib/server/paths';

export const runtime = 'nodejs';

const mediaTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!/^[a-f0-9]{16}\.(jpg|jpeg|png|webp)$/i.test(file)) {
    return NextResponse.json({ ok: false, error: 'invalid_media_name' }, { status: 400 });
  }

  try {
    const bytes = await readFile(resolve(uploadDir(), file));
    const extension = file.split('.').at(-1)?.toLowerCase() ?? '';
    return new NextResponse(bytes, {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': mediaTypes[extension] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'media_not_found' }, { status: 404 });
  }
}
