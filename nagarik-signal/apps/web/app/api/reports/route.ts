import { NextResponse } from 'next/server';
import { categories } from '@/lib/constants/categories';
import { getWard } from '@/lib/geo/wards';
import { buildProofMetadata, computeLocationHash, computeMetadataHash, normalizeGeohash } from '@/lib/proof/metadata';
import { listIssues, recordRequestEvent, recordSession, upsertIssue } from '@/lib/db/queries';
import { createIssueOnChain } from '@/lib/solana/actions';
import { explorerAddressUrl, explorerTxUrl, loadOrCreateSessionKeypair } from '@/lib/solana/server';
import { publicPreviewReadOnly } from '@/lib/deployment';
import { assertRateLimit, rateLimitResponse } from '@/lib/security/rateLimit';
import { assertTrustedMutation, requestIpHash, securityErrorResponse } from '@/lib/security/request';
import { getOrCreateServerSession, sessionDisplayId, sessionHash } from '@/lib/security/session';
import { verifyUploadReceipt } from '@/lib/security/uploadReceipt';
import type { CivicIssue, IssueCategory } from '@/lib/types';

export const runtime = 'nodejs';

const DAY = 24 * 60 * 60_000;

function isHex32(value: string) {
  return /^[0-9a-fA-F]{64}$/.test(value);
}

function rateLimited(error: unknown) {
  const result = rateLimitResponse(error);
  return result
    ? NextResponse.json(
        { ok: false, error: result.code, retryAfterSeconds: result.retryAfterSeconds },
        { status: result.status, headers: { 'Retry-After': String(result.retryAfterSeconds) } }
      )
    : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const cursor = Number(url.searchParams.get('cursor') ?? 0);
  const scope = url.searchParams.get('scope') === 'samples' ? 'samples' : 'public';
  const issues = await listIssues({
    scope,
    ward: url.searchParams.get('ward'),
    category: url.searchParams.get('category'),
    status: url.searchParams.get('status'),
    sort: url.searchParams.get('sort'),
    limit,
    cursor,
  });
  return NextResponse.json({
    ok: true,
    mode: 'durable_read_model',
    scope,
    issues,
    nextCursor: issues.length === limit ? cursor + limit : null,
  });
}

export async function POST(request: Request) {
  if (publicPreviewReadOnly) {
    return NextResponse.json({ ok: false, error: 'public_preview_read_only' }, { status: 503 });
  }

  let session: Awaited<ReturnType<typeof getOrCreateServerSession>>;
  try {
    assertTrustedMutation(request, { maxBytes: 64 * 1024 });
    session = await getOrCreateServerSession();
    await Promise.all([
      assertRateLimit({ scope: 'reports:session', identifier: session.id, limit: 2, windowMs: DAY }),
      assertRateLimit({ scope: 'reports:ip', identifier: requestIpHash(request), limit: 5, windowMs: DAY }),
    ]);
  } catch (error) {
    const security = securityErrorResponse(error);
    if (security) return NextResponse.json({ ok: false, error: security.code }, { status: security.status });
    const limited = rateLimited(error);
    if (limited) return limited;
    return NextResponse.json({ ok: false, error: 'request_security_failed' }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  const title = String(body.title ?? '').trim();
  const description = String(body.description ?? '').trim();
  const category = String(body.category ?? categories[0].id) as IssueCategory;
  if (!categories.some((item) => item.id === category)) {
    return NextResponse.json({ ok: false, error: 'invalid_category' }, { status: 400 });
  }

  const ward = getWard(String(body.wardId ?? 'kathmandu-12'));
  const requestedLat = Number(body.latDisplay ?? ward.lat);
  const requestedLng = Number(body.lngDisplay ?? ward.lng);
  if (!Number.isFinite(requestedLat) || !Number.isFinite(requestedLng)) {
    return NextResponse.json({ ok: false, error: 'invalid_location' }, { status: 400 });
  }
  const latDisplay = Number(requestedLat.toFixed(3));
  const lngDisplay = Number(requestedLng.toFixed(3));

  const observedDate = new Date(body.firstObservedAt ? String(body.firstObservedAt) : new Date().toISOString());
  if (Number.isNaN(observedDate.getTime())) {
    return NextResponse.json({ ok: false, error: 'invalid_first_observed_at' }, { status: 400 });
  }
  const firstObservedAt = observedDate.toISOString();
  const observedMs = observedDate.getTime();
  const now = Date.now();
  if (observedMs > now + 5 * 60_000 || observedMs < now - 180 * 86_400_000) {
    return NextResponse.json({ ok: false, error: 'first_observed_at_outside_mvp_range' }, { status: 400 });
  }
  if (title.length < 8 || title.length > 140 || description.length < 20 || description.length > 1_500) {
    return NextResponse.json({ ok: false, error: 'title_or_description_outside_limits' }, { status: 400 });
  }

  const photoUrl = String(body.photoUrl ?? '').trim();
  const evidenceHash = String(body.evidenceHash ?? '').trim().toLowerCase();
  const uploadReceipt = String(body.uploadReceipt ?? '').trim();
  const expectedPhotoPattern = new RegExp(`^/api/media/${evidenceHash}\\.(jpg|jpeg|png|webp)$`, 'i');
  if (!isHex32(evidenceHash) || !expectedPhotoPattern.test(photoUrl) || !uploadReceipt) {
    return NextResponse.json({ ok: false, error: 'valid_uploaded_evidence_required' }, { status: 400 });
  }
  if (!verifyUploadReceipt(uploadReceipt, { sessionId: session.id, photoUrl, evidenceHash })) {
    return NextResponse.json({ ok: false, error: 'upload_receipt_invalid_or_expired' }, { status: 400 });
  }
  const duplicateEvidence = (await listIssues({ scope: 'public', limit: 100 }))
    .some((issue) => issue.proof.evidenceHash === evidenceHash);
  if (duplicateEvidence) {
    return NextResponse.json({ ok: false, error: 'evidence_already_attached_to_public_record' }, { status: 409 });
  }

  const locality = ward.label;
  const geohash = normalizeGeohash(latDisplay, lngDisplay);
  const metadata = buildProofMetadata({
    title,
    description,
    category,
    wardId: ward.id,
    locality,
    latDisplay,
    lngDisplay,
    geohash,
    firstObservedAt,
    evidenceHash,
    photoUrl,
    recordKind: 'community_report',
    provenance: null,
  });
  const [metadataHash, locationHash] = await Promise.all([
    computeMetadataHash(metadata),
    computeLocationHash(ward.id, geohash),
  ]);
  const sessionState = loadOrCreateSessionKeypair(session.id);

  try {
    await assertRateLimit({ scope: 'relayer:onchain:global', identifier: 'devnet-relayer', limit: 50, windowMs: DAY });
    const chain = await createIssueOnChain({
      category,
      firstObservedAt,
      metadataHash,
      evidenceHash,
      locationHash,
      reporter: sessionState.keypair,
    });
    const anchoredAt = chain.chainIssue.proofAnchoredAt ?? new Date().toISOString();
    const issue: CivicIssue = {
      id: String(chain.issueId),
      issueId: chain.issueId,
      title,
      description,
      category,
      wardId: ward.id,
      locality,
      status: chain.chainIssue.status,
      geohash,
      firstObservedAt,
      proofAnchoredAt: chain.chainIssue.proofAnchoredAt,
      reporterMode: 'session',
      reporterPubkey: chain.reporterPubkey,
      recordKind: 'community_report',
      provenance: null,
      verificationCount: chain.chainIssue.verificationCount,
      updateCount: chain.chainIssue.updateCount,
      photoUrl,
      resolutionHash: null,
      resolutionPhotoUrl: null,
      safetyReviewStatus: 'visible',
      latDisplay,
      lngDisplay,
      proof: {
        issuePda: chain.issuePda,
        metadataHash,
        evidenceHash,
        locationHash,
        timelineHash: chain.chainIssue.timelineHash,
        proofStatus: 'indexed_devnet',
        createTxSig: chain.txSig,
        latestTxSig: chain.txSig,
        explorerUrl: explorerAddressUrl(chain.issuePda),
      },
      timeline: [{
        seq: 0,
        status: 'submitted',
        label: 'submitted',
        note: 'Community evidence and metadata were anchored on Solana devnet.',
        proofHash: metadataHash,
        txSig: chain.txSig,
        statusUpdatePda: null,
        createdAt: anchoredAt,
      }],
    };
    await Promise.all([
      upsertIssue(issue),
      recordSession({
        id: session.id,
        sessionPubkey: chain.reporterPubkey,
        sessionHash: sessionHash(session.id),
        displayName: sessionDisplayId(session.id),
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      }),
    ]);
    await recordRequestEvent({
      scope: 'reports:result',
      identifier: session.id,
      outcome: 'success',
      metadata: { issueId: chain.issueId, category },
    });

    return NextResponse.json({
      ok: true,
      mode: 'indexed_devnet',
      issueId: chain.issueId,
      issuePda: chain.issuePda,
      txSig: chain.txSig,
      metadataHash,
      evidenceHash,
      locationHash,
      url: `/issues/${chain.issueId}`,
      explorerUrl: explorerTxUrl(chain.txSig),
      registryInitialized: chain.registryCreated,
      registryInitTxSig: chain.registryInitTxSig,
    });
  } catch (error) {
    const limited = rateLimited(error);
    if (limited) return limited;
    await recordRequestEvent({
      scope: 'reports:result',
      identifier: session.id,
      outcome: 'failure',
      metadata: { category, error: error instanceof Error ? error.message.slice(0, 120) : 'report_create_failed' },
    }).catch(() => undefined);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'report_create_failed' },
      { status: 500 }
    );
  }
}
