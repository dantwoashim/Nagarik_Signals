import { NextResponse } from 'next/server';
import { isValidStatusTransition, statuses } from '@/lib/constants/statuses';
import { addStatusUpdate, getIssue, recordRequestEvent, recordSteward } from '@/lib/db/queries';
import { publicPreviewReadOnly } from '@/lib/deployment';
import { inferredRecordKind } from '@/lib/issues/recordKind';
import { canonicalize } from '@/lib/proof/canonicalize';
import { sha256Hex } from '@/lib/proof/hash';
import { assertRateLimit, rateLimitResponse } from '@/lib/security/rateLimit';
import { assertTrustedMutation, requestIpHash, securityErrorResponse } from '@/lib/security/request';
import { secretsMatch } from '@/lib/security/secrets';
import { getOrCreateServerSession } from '@/lib/security/session';
import { verifyUploadReceipt } from '@/lib/security/uploadReceipt';
import { updateStatusOnChain } from '@/lib/solana/actions';
import { explorerTxUrl } from '@/lib/solana/server';
import type { IssueStatus } from '@/lib/types';

export const runtime = 'nodejs';

function isHex32(value: string) {
  return /^[0-9a-fA-F]{64}$/.test(value);
}

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
    assertTrustedMutation(request, { maxBytes: 32 * 1024 });
    session = await getOrCreateServerSession();
    await assertRateLimit({
      scope: 'steward:ip',
      identifier: requestIpHash(request),
      limit: 10,
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
  if (kind === 'illustrative_sample' || kind === 'qa_fixture') {
    return NextResponse.json({ ok: false, reason: 'record_outside_steward_queue' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({})) as {
    newStatus?: string;
    note?: string;
    resolutionPhotoUrl?: string;
    resolutionEvidenceHash?: string;
    uploadReceipt?: string;
    proofHash?: string;
  };
  const newStatus = String(body.newStatus ?? '') as IssueStatus;
  if (!statuses.some((status) => status.id === newStatus)) {
    return NextResponse.json({ ok: false, reason: 'invalid_status' }, { status: 400 });
  }
  if (!isValidStatusTransition(issue.status, newStatus)) {
    return NextResponse.json({ ok: false, reason: 'invalid_status_transition' }, { status: 409 });
  }

  const note = String(body.note ?? '').trim();
  const resolutionPhotoUrl = String(body.resolutionPhotoUrl ?? '').trim() || null;
  const resolutionEvidenceHash = String(body.resolutionEvidenceHash ?? '').trim().toLowerCase();
  const uploadReceipt = String(body.uploadReceipt ?? '').trim();
  const providedProofHash = String(body.proofHash ?? '').trim().toLowerCase();
  if (note.length > 1_000) return NextResponse.json({ ok: false, reason: 'note_too_long' }, { status: 400 });
  if (providedProofHash && !isHex32(providedProofHash)) {
    return NextResponse.json({ ok: false, reason: 'invalid_proof_hash' }, { status: 400 });
  }

  if (newStatus === 'resolved') {
    const expectedPhotoPattern = new RegExp(`^/api/media/${resolutionEvidenceHash}\\.(jpg|jpeg|png|webp)$`, 'i');
    if (!note || !resolutionPhotoUrl || !isHex32(resolutionEvidenceHash) || !expectedPhotoPattern.test(resolutionPhotoUrl)) {
      return NextResponse.json({ ok: false, reason: 'resolution_artifact_and_note_required' }, { status: 400 });
    }
    if (resolutionEvidenceHash === issue.proof.evidenceHash) {
      return NextResponse.json({ ok: false, reason: 'resolution_artifact_must_differ_from_original' }, { status: 400 });
    }
    if (!uploadReceipt || !verifyUploadReceipt(uploadReceipt, {
      sessionId: session.id,
      photoUrl: resolutionPhotoUrl,
      evidenceHash: resolutionEvidenceHash,
    })) {
      return NextResponse.json({ ok: false, reason: 'resolution_upload_receipt_invalid_or_expired' }, { status: 400 });
    }
  }

  const seq = issue.updateCount + 1;
  const proofMetadata = {
    version: '1.1',
    type: 'nagarik_status_update',
    issueId: issue.issueId,
    seq,
    oldStatus: issue.status,
    newStatus,
    note,
    resolutionPhotoUrl,
    resolutionEvidenceHash: resolutionEvidenceHash || null,
    previousTimelineHash: issue.proof.timelineHash,
    stewardRole: 'platform_steward_not_municipality',
  };
  const proofHash = providedProofHash || await sha256Hex(canonicalize(proofMetadata));

  try {
    await assertRateLimit({
      scope: 'relayer:onchain:global',
      identifier: 'devnet-relayer',
      limit: 100,
      windowMs: 24 * 60 * 60_000,
    });
    const chain = await updateStatusOnChain(issue.issueId, newStatus, proofHash);
    const createdAt = chain.chainIssue.updatedAt ?? new Date().toISOString();
    await Promise.all([
      addStatusUpdate({
        issueId: issue.issueId,
        entry: {
          seq: chain.seq,
          status: chain.newStatus,
          label: chain.newStatus.replaceAll('_', ' '),
          note: note || `Platform steward changed status to ${chain.newStatus.replaceAll('_', ' ')}.`,
          proofHash,
          txSig: chain.txSig,
          statusUpdatePda: chain.statusUpdatePda,
          createdAt,
        },
        record: {
          issueId: issue.issueId,
          seq: chain.seq,
          updaterPubkey: chain.updaterPubkey,
          oldStatus: chain.oldStatus,
          newStatus: chain.newStatus,
          proofHash,
          previousTimelineHash: issue.proof.timelineHash,
          newTimelineHash: chain.chainIssue.timelineHash,
          statusUpdatePda: chain.statusUpdatePda,
          txSig: chain.txSig,
          note: note || null,
          proofPhotoUrl: resolutionPhotoUrl,
          createdAt,
        },
        issuePatch: {
          status: chain.chainIssue.status,
          verificationCount: chain.chainIssue.verificationCount,
          updateCount: chain.chainIssue.updateCount,
          resolutionHash: chain.chainIssue.status === 'resolved' ? proofHash : issue.resolutionHash,
          resolutionPhotoUrl: chain.chainIssue.status === 'resolved' ? resolutionPhotoUrl : issue.resolutionPhotoUrl,
          proof: {
            ...issue.proof,
            timelineHash: chain.chainIssue.timelineHash,
            latestTxSig: chain.txSig,
            proofStatus: 'indexed_devnet',
          },
        },
      }),
      recordSteward({
        walletPubkey: chain.updaterPubkey,
        displayName: 'Platform steward relayer (not municipality)',
        active: true,
        createdAt: new Date().toISOString(),
        revokedAt: null,
      }),
    ]);
    await recordRequestEvent({
      scope: 'steward:result',
      identifier: session.id,
      outcome: 'success',
      metadata: { issueId: issue.issueId, newStatus },
    });
    return NextResponse.json({
      ok: true,
      mode: 'indexed_devnet',
      reason: 'status_update_account_created',
      issueId: String(issue.issueId),
      seq: chain.seq,
      oldStatus: chain.oldStatus,
      newStatus: chain.newStatus,
      proofHash,
      statusUpdatePda: chain.statusUpdatePda,
      txSig: chain.txSig,
      explorerUrl: explorerTxUrl(chain.txSig),
      proofMetadata,
      stewardCreated: chain.stewardCreated,
      stewardCreateTxSig: chain.stewardCreateTxSig,
      authMode: requiredSecret ? 'secret_header' : 'local_development_open',
    });
  } catch (error) {
    const limited = rateLimitResponse(error);
    if (limited) {
      return NextResponse.json(
        { ok: false, reason: limited.code, retryAfterSeconds: limited.retryAfterSeconds },
        { status: limited.status, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
      );
    }
    const reason = error instanceof Error ? error.message : 'status_update_failed';
    await recordRequestEvent({
      scope: 'steward:result',
      identifier: session.id,
      outcome: 'failure',
      metadata: { issueId: issue.issueId, error: reason.slice(0, 120) },
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, reason }, { status: 409 });
  }
}
