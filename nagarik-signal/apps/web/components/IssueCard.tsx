import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from '@phosphor-icons/react/dist/ssr';
import { categoryLabel } from '@/lib/constants/categories';
import { statusLabel } from '@/lib/constants/statuses';
import { daysIgnored } from '@/lib/db/queries';
import { isClosedStatus } from '@/lib/constants/statuses';
import type { CivicIssue } from '@/lib/types';

export function IssueCard({ issue }: { issue: CivicIssue }) {
  const dayCount = daysIgnored(issue);
  const closed = isClosedStatus(issue.status);
  const live = issue.proof.proofStatus !== 'seeded_demo';

  return (
    <Link href={`/issues/${issue.id}`} className="issue-card-link" aria-label={`Open ${issue.title}`}>
      <article className="issue-card">
        <div className="issue-card-media">
          <Image src={issue.photoUrl} alt={`${issue.title} evidence`} fill sizes="(max-width: 620px) 100vw, (max-width: 1080px) 50vw, 260px" />
          <span className={live ? 'proof-origin live' : 'proof-origin sample'}>{live ? 'Live devnet proof' : 'Sample record'}</span>
        </div>
        <div className="issue-card-body">
          <div className="issue-card-count">
            <strong className="mono">{dayCount}</strong>
            <span>{closed ? 'days to close' : 'days ignored'}</span>
          </div>
          <div className="issue-card-copy">
            <div className="badge-row">
              <span>{categoryLabel(issue.category)}</span>
              <span className={`status-${issue.status}`}>{statusLabel(issue.status)}</span>
            </div>
            <h3>{issue.title}</h3>
            <p>{issue.description}</p>
            <div className="issue-card-meta">
              <span>#{issue.issueId} / {issue.locality}</span>
              <span>{issue.verificationCount} citizen signal{issue.verificationCount === 1 ? '' : 's'}</span>
            </div>
          </div>
          <ArrowUpRight className="issue-card-arrow" size={21} weight="bold" aria-hidden="true" />
        </div>
      </article>
    </Link>
  );
}
