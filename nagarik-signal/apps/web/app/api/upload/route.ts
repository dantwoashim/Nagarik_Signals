import { NextResponse } from 'next/server';
import { prepareUpload } from '@/lib/storage/upload';
import { showcaseReadOnly } from '@/lib/deployment';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (showcaseReadOnly) {
    return NextResponse.json({ ok: false, error: 'showcase_read_only' }, { status: 503 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'file_required' }, { status: 400 });
  }
  try {
    const upload = await prepareUpload(file);
    return NextResponse.json({ ok: true, ...upload });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'upload_failed' },
      { status: 400 }
    );
  }
}
