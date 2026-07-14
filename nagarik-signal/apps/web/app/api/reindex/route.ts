import { NextResponse } from 'next/server';
import { applyChainIssue, getIssue } from '@/lib/db/queries';
import { fetchAllIssueAccounts } from '@/lib/solana/readOnly';
import { publicPreviewReadOnly } from '@/lib/deployment';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (publicPreviewReadOnly) {
    return NextResponse.json({ ok: false, error: 'public_preview_read_only' }, { status: 503 });
  }
  const secret = request.headers.get('x-nagarik-reindex-secret');
  if (process.env.NAGARIK_REINDEX_SECRET && secret !== process.env.NAGARIK_REINDEX_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.NAGARIK_REINDEX_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'reindex_secret_required_in_production' }, { status: 401 });
  }

  try {
    const chainIssues = await fetchAllIssueAccounts();
    const reconciled = [];
    const missingReadRows = [];
    const mismatches = [];

    for (const chainIssue of chainIssues) {
      const local = getIssue(chainIssue.issueId);
      if (!local) {
        missingReadRows.push({
          issueId: chainIssue.issueId,
          issuePda: chainIssue.issuePda,
          reason: 'chain_issue_has_no_local_metadata_row',
        });
        continue;
      }

      const mismatch = {
        issueId: chainIssue.issueId,
        metadataHash: local.proof.metadataHash === chainIssue.metadataHash,
        evidenceHash: local.proof.evidenceHash === chainIssue.evidenceHash,
        locationHash: local.proof.locationHash === chainIssue.locationHash,
      };
      if (!mismatch.metadataHash || !mismatch.evidenceHash || !mismatch.locationHash) {
        mismatches.push(mismatch);
      }

      const updated = applyChainIssue({
        issueId: chainIssue.issueId,
        status: chainIssue.status,
        verificationCount: chainIssue.verificationCount,
        updateCount: chainIssue.updateCount,
        timelineHash: chainIssue.timelineHash,
        resolutionHash: chainIssue.resolutionHash,
      });
      reconciled.push({
        issueId: chainIssue.issueId,
        issuePda: chainIssue.issuePda,
        updated: Boolean(updated),
        status: chainIssue.status,
        verificationCount: chainIssue.verificationCount,
        updateCount: chainIssue.updateCount,
      });
    }

    return NextResponse.json({
      ok: mismatches.length === 0,
      mode: 'chain_reconcile',
      authMode: process.env.NAGARIK_REINDEX_SECRET ? 'secret_header' : 'dev_open_because_secret_unset',
      chainIssueCount: chainIssues.length,
      reconciled,
      missingReadRows,
      mismatches,
    }, { status: mismatches.length === 0 ? 200 : 409 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'reindex_failed' },
      { status: 500 }
    );
  }
}
