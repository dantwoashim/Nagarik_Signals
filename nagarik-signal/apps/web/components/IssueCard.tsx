import Link from 'next/link';
import { DaysIgnoredBadge } from './DaysIgnoredBadge';
import { categoryLabel } from '@/lib/constants/categories';
import { statusLabel } from '@/lib/constants/statuses';
import type { CivicIssue } from '@/lib/types';
import { shortText } from '@/lib/ui/format';

export function IssueCard({ issue }: { issue: CivicIssue }) {
  const proofLabel = issue.proof.proofStatus === 'seeded_demo' ? 'Seeded demo' : 'Proof anchored';

  return (
    <article className="panel issue-card">
      <div
        className="issue-card-media"
        style={{
          backgroundImage: `linear-gradient(135deg, rgba(23, 25, 22, 0.08), rgba(183, 31, 45, 0.12)), url(${issue.photoUrl})`,
        }}
        aria-label={`${issue.title} evidence image`}
      />
      <div className="issue-card-body">
        <div className="badge-row">
          <span className="pill">{categoryLabel(issue.category)}</span>
          <span className={`pill status-${issue.status}`}>{statusLabel(issue.status)}</span>
          <DaysIgnoredBadge issue={issue} />
        </div>
        <h3>{issue.title}</h3>
        <p className="muted">{issue.description}</p>
        <div style={{ display: 'grid', gap: 7 }}>
          <span className="muted">#{issue.issueId} - {issue.locality}</span>
          <span className="muted">
            {issue.verificationCount} citizen verification{issue.verificationCount === 1 ? '' : 's'}
          </span>
          <span className="mono muted" style={{ fontSize: 12 }}>
            {proofLabel}: {shortText(issue.proof.issuePda, 10, 8)}
          </span>
        </div>
        <div className="row-actions">
          <Link href={`/issues/${issue.id}`} className="button secondary">
            Open issue proof
          </Link>
        </div>
      </div>
    </article>
  );
}
