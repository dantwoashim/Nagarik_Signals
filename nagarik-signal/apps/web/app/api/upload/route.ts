import { NextResponse } from 'next/server';
import { prepareUpload } from '@/lib/storage/upload';

export const runtime = 'nodejs';

export async function POST(request: Request) {
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
