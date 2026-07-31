import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, MapPin } from '@phosphor-icons/react';

import {
  categoryName,
  formatPublicDate,
  lifecycleLabel,
  publicWard,
  type PublicIssueSummary,
} from '@/lib/public/contracts';

export function PublicIssueRow({ issue }: { issue: PublicIssueSummary }) {
  const ward = publicWard(issue.ward);
  const state = issue.lifecycle ?? issue.legacyStatus ?? 'open';

  return (
    <Link className="prod-record-row" href={`/issues/${issue.publicId}`}>
      <span className="prod-record-media">
        {issue.mediaUrl ? (
          <Image src={issue.mediaUrl} alt="" fill sizes="(max-width: 720px) 88px, 124px" />
        ) : (
          <span className="prod-record-media-empty" aria-hidden="true" />
        )}
      </span>
      <span className="prod-record-copy">
        <span className="prod-record-overline">
          <span className={`prod-state prod-state-${state}`}>{lifecycleLabel(issue)}</span>
          <span>{categoryName(issue.category)}</span>
        </span>
        <strong>{issue.title ?? 'Public civic record'}</strong>
        <span className="prod-record-summary">
          {issue.summary ?? 'Open the record for its reviewed public details.'}
        </span>
        <span className="prod-record-meta">
          <span>
            <MapPin size={14} weight="fill" aria-hidden="true" />
            {ward.label}
          </span>
          <span>{formatPublicDate(issue.publishedAt)}</span>
          <span>
            {issue.signalCount} signal{issue.signalCount === 1 ? '' : 's'}
          </span>
        </span>
      </span>
      <ArrowRight className="prod-record-arrow" size={18} weight="bold" aria-hidden="true" />
    </Link>
  );
}
