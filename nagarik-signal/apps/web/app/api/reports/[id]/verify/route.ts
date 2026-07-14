import { NextResponse } from 'next/server';
import { addVerification, findVerification, getIssue, recordRequestEvent, recordSession } from '@/lib/db/queries';
import { isClosedStatus } from '@/lib/constants/statuses';
import { publicPreviewReadOnly } from '@/lib/deployment';
import { inferredRecordKind } from '@/lib/issues/recordKind';
import { sha256Hex } from '@/lib/proof/hash';
import { assertRateLimit, rateLimitResponse } from '@/lib/security/rateLimit';
import { assertTrustedMutation, requestIpHash, securityErrorResponse } from '@/lib/security/request';
import { getOrCreateServerSession, sessionDisplayId, sessionHash } from '@/lib/security/session';
import { verifyIssueOnChain } from '@/lib/solana/actions';
import { explorerTxUrl, loadOrCreateSessionKeypair } from '@/lib/solana/server';

export const runtime = 'nodejs';

const DAY = 24 * 60 * 60_000;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (publicPreviewReadOnly) {
    return NextResponse.json({ ok: false, status: 'rejected', reason: 'public_preview_read_only' }, { status: 503 });
  }

  let session: Awaited<ReturnType<typeof getOrCreateServerSession>>;
  try {
    assertTrustedMutation(request, { maxBytes: 4 * 1024 });
    session = await getOrCreateServerSession();
    await Promise.all([
      assertRateLimit({ scope: 'verify:session', identifier: session.id, limit: 20, windowMs: DAY }),
      assertRateLimit({ scope: 'verify:ip', identifier: requestIpHash(request), limit: 40, windowMs: DAY }),
    ]);
  } catch (error) {
    const security = securityErrorResponse(error);
    if (security) return NextResponse.json({ ok: false, status: 'rejected', reason: security.code }, { status: security.status });
    const limited = rateLimitResponse(error);
    if (limited) {
      return NextResponse.json(
        { ok: false, status: 'rejected', reason: limited.code, retryAfterSeconds: limited.retryAfterSeconds },
        { status: limited.status, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
      );
    }
    return NextResponse.json({ ok: false, status: 'rejected', reason: 'request_security_failed' }, { status: 500 });
  }

  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) return NextResponse.json({ ok: false, status: 'rejected', reason: 'issue_not_found', issueId: id }, { status: 404 });
  const kind = inferredRecordKind(issue);
  if (kind === 'illustrative_sample' || kind === 'qa_fixture') {
    return NextResponse.json({ ok: false, status: 'rejected', reason: 'record_outside_public_verification', issueId: id }, { status: 409 });
  }
  if (isClosedStatus(issue.status)) {
    return NextResponse.json({ ok: false, status: 'rejected', reason: 'issue_closed', issueId: id }, { status: 409 });
  }

  const sessionState = loadOrCreateSessionKeypair(session.id);
  const verifierPubkey = sessionState.keypair.publicKey.toBase58();
  if (issue.reporterPubkey === verifierPubkey) {
    return NextResponse.json({ ok: false, status: 'rejected', reason: 'reporter_cannot_verify_own_issue', issueId: id }, { status: 409 });
  }
  if (await findVerification(issue.issueId, verifierPubkey)) {
    return NextResponse.json({ ok: false, status: 'rejected', reason: 'already_verified', issueId: id }, { status: 409 });
  }

  try {
    await assertRateLimit({ scope: 'relayer:onchain:global', identifier: 'devnet-relayer', limit: 100, windowMs: DAY });
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
            note: `${chain.chainIssue.verificationCount} public verification signals moved this issue to ${chain.chainIssue.status.replaceAll('_', ' ')}. Signals are rate-limited sessions, not unique-person proof.`,
            proofHash: await sha256Hex(`${issue.issueId}:${chain.verificationPda}:${chain.txSig}:${chain.chainIssue.verificationCount}`),
            txSig: chain.txSig,
            statusUpdatePda: null,
            createdAt: now,
          },
        ].sort((a, b) => a.seq - b.seq)
      : issue.timeline;
    await Promise.all([
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
      ),
      recordSession({
        id: session.id,
        sessionPubkey: verifierPubkey,
        sessionHash: sessionHash(session.id),
        displayName: sessionDisplayId(session.id),
        createdAt: now,
        lastSeenAt: now,
      }),
    ]);
    await recordRequestEvent({
      scope: 'verify:result',
      identifier: session.id,
      outcome: 'success',
      metadata: { issueId: issue.issueId },
    });
    return NextResponse.json({
      ok: true,
      status: 'verified',
      reason: 'verification_account_created',
      issueId: String(issue.issueId),
      verifierPubkey,
      verificationPda: chain.verificationPda,
      txSig: chain.txSig,
      explorerUrl: explorerTxUrl(chain.txSig),
      verificationCount: chain.chainIssue.verificationCount,
      issueStatus: chain.chainIssue.status,
    });
  } catch (error) {
    const limited = rateLimitResponse(error);
    if (limited) {
      return NextResponse.json(
        { ok: false, status: 'rejected', reason: limited.code, retryAfterSeconds: limited.retryAfterSeconds },
        { status: limited.status, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
      );
    }
    const message = error instanceof Error ? error.message : 'verify_issue_failed';
    const reason = message.includes('already in use') || message.includes('DuplicateVerification')
      ? 'already_verified_on_chain'
      : message.includes('SelfVerificationNotAllowed')
        ? 'reporter_cannot_verify_own_issue'
        : message.includes('IssueClosed')
          ? 'issue_closed'
          : message;
    await recordRequestEvent({
      scope: 'verify:result',
      identifier: session.id,
      outcome: 'failure',
      metadata: { issueId: issue.issueId, error: reason.slice(0, 120) },
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, status: 'rejected', reason, issueId: id }, { status: 409 });
  }
}
