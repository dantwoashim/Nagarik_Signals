import { NextResponse } from 'next/server';

import { getDatabase } from '@/lib/db/postgres';
import { findPublicIssue, findPublicIssueProof } from '@/lib/db/repositories/publicIssues';
import { buildPublicProofResponse } from '@/lib/services/proof';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function notFound() {
  return NextResponse.json(
    { ok: false, error: { code: 'proof_not_found', retryable: false } },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  if (!publicIdPattern.test(publicId) || process.env.NAGARIK_CAP_PUBLIC_READ !== 'true') {
    return notFound();
  }
  try {
    const sql = getDatabase();
    const [issue, proof] = await Promise.all([
      findPublicIssue(sql, publicId),
      findPublicIssueProof(sql, publicId),
    ]);
    if (!issue || !proof) return notFound();
    if (issue.access_restricted && issue.publication_state !== 'removed') return notFound();
    const data = await buildPublicProofResponse({
      issue,
      proof,
      appOrigin: new URL(request.url).origin,
    });
    return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'proof_check_unavailable', retryable: true } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
