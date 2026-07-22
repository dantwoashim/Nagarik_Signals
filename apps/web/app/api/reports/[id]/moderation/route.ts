import { NextResponse } from 'next/server';
import { getIssue, recordRequestEvent, updateSafetyReview } from '@/lib/db/queries';
import { publicPreviewReadOnly } from '@/lib/deployment';
import { inferredRecordKind } from '@/lib/issues/recordKind';
import { assertRateLimit, rateLimitResponse } from '@/lib/security/rateLimit';
import { assertTrustedMutation, requestIpHash, securityErrorResponse } from '@/lib/security/request';
import { secretsMatch } from '@/lib/security/secrets';
import { getOrCreateServerSession } from '@/lib/security/session';
import type { SafetyReviewStatus } from '@/lib/types';

export const runtime = 'nodejs';

const moderationStates = new Set<SafetyReviewStatus>([
  'visible',
  'hidden_media',
  'disputed',
  'rejected',
  'resolved',
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (publicPreviewReadOnly) {
    return NextResponse.json({ ok: false, reason: 'public_preview_read_only' }, { status: 503 });
  }

  const requiredSecret = process.env.NAGARIK_STEWARD_SECRET;
  const providedSecret = request.headers.get('x-nagarik-steward-secret');
  if (!requiredSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, reason: 'steward_secret_not_configured' }, { status: 503 });
  }
  if (requiredSecret && !secretsMatch(providedSecret, requiredSecret)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized_steward' }, { status: 401 });
  }

  let session: Awaited<ReturnType<typeof getOrCreateServerSession>>;
  try {
    assertTrustedMutation(request, { maxBytes: 16 * 1024 });
    session = await getOrCreateServerSession();
    await assertRateLimit({
      scope: 'moderation:ip',
      identifier: requestIpHash(request),
      limit: 20,
      windowMs: 60_000,
    });
  } catch (error) {
    const security = securityErrorResponse(error);
    if (security) return NextResponse.json({ ok: false, reason: security.code }, { status: security.status });
    const limited = rateLimitResponse(error);
    if (limited) {
      return NextResponse.json(
        { ok: false, reason: limited.code, retryAfterSeconds: limited.retryAfterSeconds },
        { status: limited.status, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
      );
    }
    return NextResponse.json({ ok: false, reason: 'request_security_failed' }, { status: 500 });
  }

  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) return NextResponse.json({ ok: false, reason: 'issue_not_found' }, { status: 404 });
  const kind = inferredRecordKind(issue);
  if (kind !== 'community_report' && kind !== 'public_source') {
    return NextResponse.json({ ok: false, reason: 'record_outside_moderation' }, { status: 409 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const safetyReviewStatus = String(body?.safetyReviewStatus ?? '') as SafetyReviewStatus;
  const note = String(body?.note ?? '').trim();
  if (!moderationStates.has(safetyReviewStatus)) {
    return NextResponse.json({ ok: false, reason: 'invalid_moderation_state' }, { status: 400 });
  }
  if (note.length < 8 || note.length > 500) {
    return NextResponse.json({ ok: false, reason: 'moderation_note_outside_limits' }, { status: 400 });
  }
  if (safetyReviewStatus === 'resolved' && issue.status !== 'resolved') {
    return NextResponse.json({ ok: false, reason: 'chain_status_must_be_resolved_first' }, { status: 409 });
  }

  const oldSafetyReviewStatus = issue.safetyReviewStatus;
  const updated = await updateSafetyReview({ issueId: issue.issueId, safetyReviewStatus });
  if (!updated) return NextResponse.json({ ok: false, reason: 'issue_not_found' }, { status: 404 });

  await recordRequestEvent({
    scope: 'moderation:result',
    identifier: session.id,
    outcome: 'success',
    metadata: {
      issueId: issue.issueId,
      oldSafetyReviewStatus,
      safetyReviewStatus,
      note,
    },
  });

  return NextResponse.json({
    ok: true,
    issueId: issue.issueId,
    oldSafetyReviewStatus,
    safetyReviewStatus,
    mediaPublic: safetyReviewStatus !== 'hidden_media' && safetyReviewStatus !== 'rejected',
    discoverable: safetyReviewStatus !== 'rejected',
  });
}
