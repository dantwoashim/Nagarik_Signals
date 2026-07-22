import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  addAuthorityHandoff,
  getIssue,
  listAuthorityHandoffs,
  recordRequestEvent,
} from '@/lib/db/queries';
import { publicPreviewReadOnly } from '@/lib/deployment';
import { handoffDraftMatches, validateHandoffDraft } from '@/lib/handoffs/policy';
import { inferredRecordKind } from '@/lib/issues/recordKind';
import { assertRateLimit, rateLimitResponse } from '@/lib/security/rateLimit';
import { assertTrustedMutation, requestIpHash, securityErrorResponse } from '@/lib/security/request';
import { secretsMatch } from '@/lib/security/secrets';
import { getOrCreateServerSession } from '@/lib/security/session';
import { verifyUploadReceipt } from '@/lib/security/uploadReceipt';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_32 = /^[0-9a-f]{64}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) return NextResponse.json({ ok: false, error: 'issue_not_found' }, { status: 404 });
  const handoffs = await listAuthorityHandoffs(issue.issueId);
  return NextResponse.json({
    ok: true,
    mode: 'platform_audit_log_not_onchain',
    integrity: true,
    boundary: 'Recorded by Nagarik Signal stewards; not authored or independently verified by the receiving authority.',
    issueId: issue.issueId,
    current: handoffs.at(-1) ?? null,
    handoffs,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (publicPreviewReadOnly) {
    return NextResponse.json({ ok: false, error: 'public_preview_read_only' }, { status: 503 });
  }

  const requiredSecret = process.env.NAGARIK_STEWARD_SECRET;
  const providedSecret = request.headers.get('x-nagarik-steward-secret');
  if (!requiredSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'steward_secret_not_configured' }, { status: 503 });
  }
  if (requiredSecret && !secretsMatch(providedSecret, requiredSecret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized_steward' }, { status: 401 });
  }

  let session: Awaited<ReturnType<typeof getOrCreateServerSession>>;
  try {
    assertTrustedMutation(request, { maxBytes: 48 * 1024 });
    session = await getOrCreateServerSession();
    await assertRateLimit({
      scope: 'steward:ip',
      identifier: requestIpHash(request),
      limit: 10,
      windowMs: 60_000,
    });
  } catch (error) {
    const security = securityErrorResponse(error);
    if (security) return NextResponse.json({ ok: false, error: security.code }, { status: security.status });
    const limited = rateLimitResponse(error);
    if (limited) {
      return NextResponse.json(
        { ok: false, error: limited.code, retryAfterSeconds: limited.retryAfterSeconds },
        { status: limited.status, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
      );
    }
    return NextResponse.json({ ok: false, error: 'request_security_failed' }, { status: 500 });
  }

  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) return NextResponse.json({ ok: false, error: 'issue_not_found' }, { status: 404 });
  const kind = inferredRecordKind(issue);
  if (kind === 'illustrative_sample' || kind === 'qa_fixture') {
    return NextResponse.json({ ok: false, error: 'record_outside_handoff_queue' }, { status: 409 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  const existingHandoffs = await listAuthorityHandoffs();
  const idempotencyKey = String(body.idempotencyKey ?? '').trim() || randomUUID();
  if (!UUID.test(idempotencyKey)) {
    return NextResponse.json({ ok: false, error: 'invalid_idempotency_key' }, { status: 400 });
  }
  const expectedRaw = String(body.expectedPreviousEventHash ?? '').trim().toLowerCase();
  const expectedPreviousEventHash = expectedRaw || null;
  if (expectedPreviousEventHash && !HEX_32.test(expectedPreviousEventHash)) {
    return NextResponse.json({ ok: false, error: 'invalid_expected_previous_event_hash' }, { status: 400 });
  }
  const idempotentRecord = existingHandoffs.find((row) => row.idempotencyKey === idempotencyKey);
  if (idempotentRecord) {
    const predecessor = existingHandoffs.find((row) =>
      row.issueId === idempotentRecord.issueId && row.seq === idempotentRecord.seq - 1
    ) ?? null;
    const retryDraft = validateHandoffDraft(
      body,
      predecessor?.state ?? null,
      Date.parse(idempotentRecord.occurredAt),
    );
    if (
      idempotentRecord.issueId !== issue.issueId
      || expectedPreviousEventHash !== idempotentRecord.previousEventHash
      || !retryDraft.ok
      || !handoffDraftMatches(idempotentRecord, retryDraft.value)
    ) {
      return NextResponse.json({ ok: false, error: 'idempotency_key_reused' }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      mode: 'platform_audit_log_not_onchain',
      integrity: true,
      boundary: 'This event is steward-recorded and separate from the Solana status timeline.',
      created: false,
      issueId: issue.issueId,
      handoff: idempotentRecord,
      authMode: requiredSecret ? 'secret_header' : 'local_development_open',
    });
  }
  const issueHandoffs = existingHandoffs.filter((row) => row.issueId === issue.issueId);
  const previous = issueHandoffs.at(-1) ?? null;
  const validated = validateHandoffDraft(body, previous?.state ?? null);
  if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });

  if (validated.value.receiptPhotoUrl && validated.value.receiptEvidenceHash) {
    const uploadReceipt = String(body.uploadReceipt ?? '').trim();
    if (!uploadReceipt || !verifyUploadReceipt(uploadReceipt, {
      sessionId: session.id,
      photoUrl: validated.value.receiptPhotoUrl,
      evidenceHash: validated.value.receiptEvidenceHash,
    })) {
      return NextResponse.json({ ok: false, error: 'receipt_upload_receipt_invalid_or_expired' }, { status: 400 });
    }
    if (
      validated.value.receiptEvidenceHash === issue.proof.evidenceHash
      || validated.value.receiptEvidenceHash === issue.resolutionHash
      || existingHandoffs.some((row) => row.receiptEvidenceHash === validated.value.receiptEvidenceHash)
    ) {
      return NextResponse.json({ ok: false, error: 'receipt_artifact_already_used' }, { status: 409 });
    }
  }

  try {
    const result = await addAuthorityHandoff({
      issueId: issue.issueId,
      idempotencyKey,
      expectedPreviousEventHash,
      draft: validated.value,
    });
    await recordRequestEvent({
      scope: 'steward:handoff',
      identifier: session.id,
      outcome: 'success',
      metadata: {
        issueId: issue.issueId,
        state: result.record.state,
        created: result.created,
        evidenceBasis: result.record.evidenceBasis,
      },
    });
    return NextResponse.json({
      ok: true,
      mode: 'platform_audit_log_not_onchain',
      integrity: true,
      boundary: 'This event is steward-recorded and separate from the Solana status timeline.',
      created: result.created,
      issueId: issue.issueId,
      handoff: result.record,
      authMode: requiredSecret ? 'secret_header' : 'local_development_open',
    }, { status: result.created ? 201 : 200 });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'handoff_record_failed';
    await recordRequestEvent({
      scope: 'steward:handoff',
      identifier: session.id,
      outcome: 'failure',
      metadata: { issueId: issue.issueId, error: reason.slice(0, 120) },
    }).catch(() => undefined);
    const status = reason === 'handoff_state_changed'
      || reason === 'invalid_handoff_transition'
      || reason === 'idempotency_key_reused'
      ? 409
      : 400;
    return NextResponse.json({ ok: false, error: reason }, { status });
  }
}
