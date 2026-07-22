import { NextResponse } from 'next/server';
import { publicPreviewReadOnly } from '@/lib/deployment';
import { recordRequestEvent } from '@/lib/db/queries';
import { assertRateLimit, rateLimitResponse } from '@/lib/security/rateLimit';
import { assertTrustedMutation, requestIpHash, securityErrorResponse } from '@/lib/security/request';
import { getOrCreateServerSession } from '@/lib/security/session';
import { createUploadReceipt } from '@/lib/security/uploadReceipt';
import { prepareUpload } from '@/lib/storage/upload';

export const runtime = 'nodejs';

const HOUR = 60 * 60_000;

export async function POST(request: Request) {
  if (publicPreviewReadOnly) {
    return NextResponse.json({ ok: false, error: 'public_preview_read_only' }, { status: 503 });
  }

  let session: Awaited<ReturnType<typeof getOrCreateServerSession>>;
  try {
    assertTrustedMutation(request, { maxBytes: 9 * 1024 * 1024 });
    session = await getOrCreateServerSession();
    await Promise.all([
      assertRateLimit({ scope: 'uploads:session', identifier: session.id, limit: 3, windowMs: HOUR }),
      assertRateLimit({ scope: 'uploads:ip', identifier: requestIpHash(request), limit: 10, windowMs: HOUR }),
    ]);
  } catch (error) {
    const security = securityErrorResponse(error);
    if (security) return NextResponse.json({ ok: false, error: security.code }, { status: security.status });
    const limited = rateLimitResponse(error);
    if (limited) {
      return NextResponse.json(
        { ok: false, error: limited.code, retryAfterSeconds: limited.retryAfterSeconds },
        { status: limited.status, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
      );
    }
    return NextResponse.json({ ok: false, error: 'request_security_failed' }, { status: 500 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'file_required' }, { status: 400 });
  }
  try {
    const upload = await prepareUpload(file);
    const uploadReceipt = createUploadReceipt({
      sessionId: session.id,
      photoUrl: upload.photoUrl,
      evidenceHash: upload.evidenceHash,
    });
    await recordRequestEvent({
      scope: 'uploads:result',
      identifier: session.id,
      outcome: 'success',
      metadata: { bytes: upload.sanitizedSize, mediaType: upload.mediaType },
    });
    return NextResponse.json({ ok: true, ...upload, uploadReceipt });
  } catch (error) {
    await recordRequestEvent({
      scope: 'uploads:result',
      identifier: session.id,
      outcome: 'failure',
      metadata: { error: error instanceof Error ? error.message.slice(0, 120) : 'upload_failed' },
    }).catch(() => undefined);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'upload_failed' },
      { status: 400 }
    );
  }
}
