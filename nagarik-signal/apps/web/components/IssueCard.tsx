import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, Eye, MapPin, ShieldWarning } from '@phosphor-icons/react/dist/ssr';
import { categoryLabel } from '@/lib/constants/categories';
import { statusLabel } from '@/lib/constants/statuses';
import { daysIgnored } from '@/lib/db/queries';
import { isClosedStatus } from '@/lib/constants/statuses';
import type { CivicIssue } from '@/lib/types';
import { inferredRecordKind, recordKindLabel, sourceFreshness } from '@/lib/issues/recordKind';

export function IssueCard({ issue, variant = 'grid', priority = false }: { issue: CivicIssue; variant?: 'grid' | 'ledger'; priority?: boolean }) {
  const dayCount = daysIgnored(issue);
  const closed = isClosedStatus(issue.status);
  const kind = inferredRecordKind(issue);
  const sourceState = sourceFreshness(issue);
  const dayLabel = kind === 'public_source'
    ? 'days since source report'
    : kind === 'illustrative_sample'
      ? 'sample days observed'
      : closed ? 'days to close' : 'days observed';
  const originClass = kind === 'public_source' || kind === 'community_report' ? 'live' : 'sample';
  const mediaVisible = issue.safetyReviewStatus !== 'hidden_media' && issue.safetyReviewStatus !== 'rejected';

  return (
    <Link href={`/issues/${issue.id}`} className="issue-card-link" aria-label={`Open ${issue.title}`}>
      <article className={`issue-card issue-card-${variant}`}>
        <div className={`issue-card-media ${kind === 'public_source' ? 'source-dossier-media' : ''}`}>
          {mediaVisible ? (
            <Image
              src={issue.photoUrl}
              alt={kind === 'public_source' ? `Source dossier for ${issue.title}` : kind === 'illustrative_sample' ? `Illustrative sample for ${issue.title}` : `Evidence for ${issue.title}`}
              fill
              sizes={variant === 'ledger' ? '(max-width: 620px) 100vw, (max-width: 1080px) 42vw, 360px' : '(max-width: 620px) 100vw, (max-width: 1080px) 50vw, 260px'}
              priority={priority}
            />
          ) : (
            <div className="card-media-withheld" role="img" aria-label="Evidence media withheld after safety review">
              <ShieldWarning size={28} weight="regular" />
              <span>Media withheld</span>
            </div>
          )}
          <span className={`proof-origin ${originClass}`}>{recordKindLabel(issue)}</span>
        </div>
        <div className="issue-card-body">
          <div className="issue-card-count">
            <strong className="mono">{dayCount}</strong>
            <span>{dayLabel}</span>
          </div>
          <div className="issue-card-copy">
            <div className="badge-row">
              <span>{categoryLabel(issue.category)}</span>
              <span className={`status-${issue.status}`}>{statusLabel(issue.status)}</span>
            </div>
            <h3>{issue.title}</h3>
            <p>{issue.description}</p>
            <div className="issue-card-meta">
              <span><MapPin size={14} weight="bold" />{issue.locality}</span>
              <span><Eye size={14} weight="bold" />{issue.verificationCount} public signal{issue.verificationCount === 1 ? '' : 's'}</span>
            </div>
            {kind === 'public_source' ? (
              <div className={`source-review-state ${sourceState === 'recheck_due' ? 'due' : ''}`}>
                {sourceState === 'recheck_due' ? 'Source review due' : `Source checked by ${issue.provenance?.publisher ?? 'publisher'}`}
              </div>
            ) : null}
          </div>
          <div className="issue-card-open">
            <span className="mono">#{issue.issueId}</span>
            <ArrowUpRight className="issue-card-arrow" size={21} weight="bold" aria-hidden="true" />
          </div>
        </div>
      </article>
    </Link>
  );
}
