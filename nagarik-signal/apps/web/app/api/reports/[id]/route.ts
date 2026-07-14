import { NextResponse } from 'next/server';
import { daysIgnored, getIssue, listVerifications } from '@/lib/db/queries';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) return NextResponse.json({ ok: false, error: 'issue_not_found' }, { status: 404 });
  return NextResponse.json({
    ok: true,
    mode: issue.proof.proofStatus,
    issue: {
      ...issue,
      daysIgnored: daysIgnored(issue),
      verifications: await listVerifications(issue.issueId),
      proofData: issue.proof,
    },
  });
}
