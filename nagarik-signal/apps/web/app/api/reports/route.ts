import { NextResponse } from 'next/server';
import { categories } from '@/lib/constants/categories';
import { getWard } from '@/lib/geo/wards';
import { buildProofMetadata, computeLocationHash, computeMetadataHash, normalizeGeohash } from '@/lib/proof/metadata';
import { sha256Hex } from '@/lib/proof/hash';
import { listIssues, recordSession, upsertIssue } from '@/lib/db/queries';
import { createIssueOnChain } from '@/lib/solana/actions';
import { explorerAddressUrl, explorerTxUrl, loadOrCreateSessionKeypair } from '@/lib/solana/server';
import type { CivicIssue, IssueCategory } from '@/lib/types';

export const runtime = 'nodejs';

function isHex32(value: string) {
  return /^[0-9a-fA-F]{64}$/.test(value);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const cursor = Number(url.searchParams.get('cursor') ?? 0);
  const issues = listIssues({
    ward: url.searchParams.get('ward'),
    category: url.searchParams.get('category'),
    status: url.searchParams.get('status'),
    sort: url.searchParams.get('sort'),
    limit,
    cursor,
  });
  return NextResponse.json({
    ok: true,
    mode: 'local_json_read_model',
    issues,
    nextCursor: issues.length === limit ? cursor + limit : null,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  const title = String(body.title ?? '').trim();
  const description = String(body.description ?? '').trim();
  const category = String(body.category ?? categories[0].id) as IssueCategory;
  if (!categories.some((item) => item.id === category)) {
    return NextResponse.json({ ok: false, error: 'invalid_category' }, { status: 400 });
  }
  const ward = getWard(String(body.wardId ?? 'kathmandu-12'));
  const latDisplay = Number(body.latDisplay ?? ward.lat);
  const lngDisplay = Number(body.lngDisplay ?? ward.lng);
  if (!Number.isFinite(latDisplay) || !Number.isFinite(lngDisplay)) {
    return NextResponse.json({ ok: false, error: 'invalid_location' }, { status: 400 });
  }
  const observedRaw = body.firstObservedAt ? String(body.firstObservedAt) : new Date().toISOString();
  const observedDate = new Date(observedRaw);
  if (Number.isNaN(observedDate.getTime())) {
    return NextResponse.json({ ok: false, error: 'invalid_first_observed_at' }, { status: 400 });
  }
  const firstObservedAt = observedDate.toISOString();
  const observedMs = Date.parse(firstObservedAt);
  const now = Date.now();
  if (observedMs > now + 5 * 60_000 || observedMs < now - 180 * 86_400_000) {
    return NextResponse.json({ ok: false, error: 'first_observed_at_outside_mvp_range' }, { status: 400 });
  }
  if (title.length < 8 || description.length < 20) {
    return NextResponse.json({ ok: false, error: 'title_and_description_required' }, { status: 400 });
  }
  const photoUrl = String(body.photoUrl ?? '').trim();
  const evidenceHash = String(body.evidenceHash ?? '').trim().toLowerCase();
  if (!photoUrl || !isHex32(evidenceHash)) {
    return NextResponse.json({ ok: false, error: 'uploaded_photo_url_and_evidence_hash_required' }, { status: 400 });
  }

  const locality = String(body.locality ?? ward.label).trim() || ward.label;
  const geohash = normalizeGeohash(latDisplay, lngDisplay, String(body.geohash ?? '').trim());
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
  });
  const metadataHash = await computeMetadataHash(metadata);
  const locationHash = await computeLocationHash(ward.id, geohash);
  const sessionId = String(body.sessionId ?? 'anonymous-report-session');
  const sessionState = loadOrCreateSessionKeypair(sessionId);
  const sessionHash = await sha256Hex(sessionId);

  try {
    const chain = await createIssueOnChain({
      category,
      firstObservedAt,
      metadataHash,
      evidenceHash,
      locationHash,
      reporter: sessionState.keypair,
    });

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
      timeline: [
        {
          seq: 0,
          status: 'submitted',
          label: 'submitted',
          note: 'Issue proof anchored on Solana devnet.',
          proofHash: metadataHash,
          txSig: chain.txSig,
          statusUpdatePda: null,
          createdAt: chain.chainIssue.proofAnchoredAt ?? new Date().toISOString(),
        },
      ],
    };
    upsertIssue(issue);
    recordSession({
      id: sessionId,
      sessionPubkey: chain.reporterPubkey,
      sessionHash,
      displayName: typeof body.displayName === 'string' ? body.displayName : null,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
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
      sessionPubkey: chain.reporterPubkey,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'report_create_failed' },
      { status: 500 }
    );
  }
}
