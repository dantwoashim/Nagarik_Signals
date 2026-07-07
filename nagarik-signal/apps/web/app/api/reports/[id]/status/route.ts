import { NextResponse } from 'next/server';
import { statuses } from '@/lib/constants/statuses';
import { addStatusUpdate, getIssue, recordSteward } from '@/lib/db/queries';
import { canonicalize } from '@/lib/proof/canonicalize';
import { sha256Hex } from '@/lib/proof/hash';
import { updateStatusOnChain } from '@/lib/solana/actions';
import { explorerTxUrl } from '@/lib/solana/server';
import type { IssueStatus } from '@/lib/types';

export const runtime = 'nodejs';

function isHex32(value: string) {
  return /^[0-9a-fA-F]{64}$/.test(value);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = getIssue(id);
  if (!issue) return NextResponse.json({ ok: false, reason: 'issue_not_found' }, { status: 404 });
  if (issue.proof.proofStatus === 'seeded_demo') {
    return NextResponse.json({ ok: false, reason: 'seeded_demo_not_on_chain' }, { status: 409 });
  }
  const requiredSecret = process.env.NAGARIK_STEWARD_SECRET;
  const providedSecret = request.headers.get('x-nagarik-steward-secret');
  if (requiredSecret && providedSecret !== requiredSecret) {
    return NextResponse.json({ ok: false, reason: 'unauthorized_steward' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as {
    newStatus?: string;
    note?: string;
    resolutionPhotoUrl?: string;
    resolutionEvidenceHash?: string;
    proofHash?: string;
  };
  const newStatus = String(body.newStatus ?? '') as IssueStatus;
  const valid = statuses.some((status) => status.id === newStatus);
  if (!valid) return NextResponse.json({ ok: false, reason: 'invalid_status' }, { status: 400 });
  if (newStatus === issue.status) return NextResponse.json({ ok: false, reason: 'status_unchanged' }, { status: 400 });
  const note = String(body.note ?? '').trim();
  const resolutionPhotoUrl = String(body.resolutionPhotoUrl ?? '').trim() || null;
  const resolutionEvidenceHash = String(body.resolutionEvidenceHash ?? '').trim().toLowerCase();
  const providedProofHash = String(body.proofHash ?? '').trim().toLowerCase();
  if (resolutionEvidenceHash && !isHex32(resolutionEvidenceHash)) {
    return NextResponse.json({ ok: false, reason: 'invalid_resolution_evidence_hash' }, { status: 400 });
  }
  if (providedProofHash && !isHex32(providedProofHash)) {
    return NextResponse.json({ ok: false, reason: 'invalid_proof_hash' }, { status: 400 });
  }
  if (newStatus === 'resolved' && !providedProofHash && (!note || !resolutionPhotoUrl || !resolutionEvidenceHash)) {
    return NextResponse.json({ ok: false, reason: 'resolution_proof_required' }, { status: 400 });
  }
  const seq = issue.updateCount + 1;
  const proofMetadata = {
    version: '1.0',
    type: 'nagarik_status_update',
    issueId: issue.issueId,
    seq,
    oldStatus: issue.status,
    newStatus,
    note,
    resolutionPhotoUrl,
    resolutionEvidenceHash: resolutionEvidenceHash || null,
    previousTimelineHash: issue.proof.timelineHash,
  };
  const proofHash = providedProofHash
    ? providedProofHash
    : await sha256Hex(canonicalize(proofMetadata));

  try {
    const chain = await updateStatusOnChain(issue.issueId, newStatus, proofHash);
    const createdAt = chain.chainIssue.updatedAt ?? new Date().toISOString();
    addStatusUpdate({
      issueId: issue.issueId,
      entry: {
        seq: chain.seq,
        status: chain.newStatus,
        label: chain.newStatus.replaceAll('_', ' '),
        note: note || `Steward changed status to ${chain.newStatus.replaceAll('_', ' ')}.`,
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
    });
    recordSteward({
      walletPubkey: chain.updaterPubkey,
      displayName: 'Local steward relayer',
      active: true,
      createdAt: new Date().toISOString(),
      revokedAt: null,
    });
    return NextResponse.json({
      ok: true,
      mode: 'indexed_devnet',
      reason: 'status_update_pda_created',
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
      authMode: requiredSecret ? 'secret_header' : 'dev_open_because_secret_unset',
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : 'status_update_failed' },
      { status: 409 }
    );
  }
}
