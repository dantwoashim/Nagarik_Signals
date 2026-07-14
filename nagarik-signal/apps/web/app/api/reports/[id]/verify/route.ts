import { NextResponse } from 'next/server';
import { addVerification, findVerification, getIssue, recordSession } from '@/lib/db/queries';
import { isClosedStatus } from '@/lib/constants/statuses';
import { sha256Hex } from '@/lib/proof/hash';
import { verifyIssueOnChain } from '@/lib/solana/actions';
import { explorerTxUrl, loadOrCreateSessionKeypair } from '@/lib/solana/server';
import { showcaseReadOnly } from '@/lib/deployment';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (showcaseReadOnly) {
    return NextResponse.json({ ok: false, status: 'rejected', reason: 'showcase_read_only' }, { status: 503 });
  }
  const { id } = await params;
  const issue = getIssue(id);
  if (!issue) return NextResponse.json({ ok: false, status: 'rejected', reason: 'issue_not_found', issueId: id }, { status: 404 });
  if (issue.proof.proofStatus === 'seeded_demo') {
    return NextResponse.json({ ok: false, status: 'rejected', reason: 'seeded_demo_not_on_chain', issueId: id }, { status: 409 });
  }
  if (isClosedStatus(issue.status)) {
    return NextResponse.json({ ok: false, status: 'rejected', reason: 'issue_closed', issueId: id }, { status: 409 });
  }

  const body = await request.json().catch(() => ({})) as { sessionId?: string; verifierPubkey?: string; displayName?: string };
  const sessionId = body.sessionId ?? (body.verifierPubkey ? `legacy-${body.verifierPubkey}` : 'anonymous-verifier-session');
  const sessionState = loadOrCreateSessionKeypair(sessionId);
  const verifierPubkey = sessionState.keypair.publicKey.toBase58();

  if (issue.reporterPubkey === verifierPubkey) {
    return NextResponse.json({ ok: false, status: 'rejected', reason: 'reporter_cannot_verify_own_issue', issueId: id }, { status: 409 });
  }
  if (findVerification(issue.issueId, verifierPubkey)) {
    return NextResponse.json({ ok: false, status: 'rejected', reason: 'already_verified', issueId: id, verifierPubkey }, { status: 409 });
  }

  try {
    const chain = await verifyIssueOnChain(issue.issueId, sessionState.keypair);
    const now = new Date().toISOString();
    const statusChanged = chain.chainIssue.status !== issue.status;
    const timeline = statusChanged
      ? [
          ...issue.timeline,
          {
            seq: issue.updateCount + 0.5,
            status: chain.chainIssue.status,
            label: chain.chainIssue.status.replaceAll('_', ' '),
            note: `${chain.chainIssue.verificationCount} citizen verifications moved this issue to ${chain.chainIssue.status.replaceAll('_', ' ')}.`,
            proofHash: await sha256Hex(`${issue.issueId}:${chain.verificationPda}:${chain.txSig}:${chain.chainIssue.verificationCount}`),
            txSig: chain.txSig,
            statusUpdatePda: null,
            createdAt: now,
          },
        ].sort((a, b) => a.seq - b.seq)
      : issue.timeline;
    addVerification(
      {
        issueId: issue.issueId,
        verifierPubkey,
        verifierMode: 'session',
        verificationPda: chain.verificationPda,
        txSig: chain.txSig,
        createdAt: now,
      },
      {
        status: chain.chainIssue.status,
        verificationCount: chain.chainIssue.verificationCount,
        updateCount: chain.chainIssue.updateCount,
        timeline,
        proof: {
          ...issue.proof,
          timelineHash: chain.chainIssue.timelineHash,
          latestTxSig: chain.txSig,
          proofStatus: 'indexed_devnet',
        },
      }
    );
    recordSession({
      id: sessionId,
      sessionPubkey: verifierPubkey,
      sessionHash: await sha256Hex(sessionId),
      displayName: body.displayName ?? null,
      createdAt: now,
      lastSeenAt: now,
    });
    return NextResponse.json({
      ok: true,
      status: 'verified',
      reason: 'verification_pda_created',
      issueId: String(issue.issueId),
      verifierPubkey,
      verificationPda: chain.verificationPda,
      txSig: chain.txSig,
      explorerUrl: explorerTxUrl(chain.txSig),
      verificationCount: chain.chainIssue.verificationCount,
      issueStatus: chain.chainIssue.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'verify_issue_failed';
    const reason = message.includes('already in use') || message.includes('DuplicateVerification')
      ? 'already_verified_on_chain'
      : message.includes('SelfVerificationNotAllowed')
        ? 'reporter_cannot_verify_own_issue'
        : message.includes('IssueClosed')
          ? 'issue_closed'
          : message;
    return NextResponse.json({ ok: false, status: 'rejected', reason, issueId: id }, { status: 409 });
  }
}
