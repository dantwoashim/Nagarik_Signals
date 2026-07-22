import { NextResponse } from 'next/server';
import { getIssue } from '@/lib/db/queries';
import { verifyIssueProof } from '@/lib/proof/verifyProof';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) return NextResponse.json({ ok: false, error: 'issue_not_found' }, { status: 404 });
  try {
    const result = await verifyIssueProof(issue);
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        matches: false,
        issueId: id,
        error: error instanceof Error ? error.message : 'proof_verification_failed',
      },
      { status: 502 }
    );
  }
}
