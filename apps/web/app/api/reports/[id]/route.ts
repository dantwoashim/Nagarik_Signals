import { NextResponse } from 'next/server';
import { daysIgnored, getIssue, listAuthorityHandoffs, listVerifications } from '@/lib/db/queries';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) return NextResponse.json({ ok: false, error: 'issue_not_found' }, { status: 404 });
  const [verifications, authorityHandoffs] = await Promise.all([
    listVerifications(issue.issueId),
    listAuthorityHandoffs(issue.issueId),
  ]);
  return NextResponse.json({
    ok: true,
    mode: issue.proof.proofStatus,
    issue: {
      ...issue,
      daysIgnored: daysIgnored(issue),
      verifications,
      authorityHandoffs,
      proofData: issue.proof,
    },
  });
}
