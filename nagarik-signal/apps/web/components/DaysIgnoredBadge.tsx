import type { CivicIssue } from '@/lib/types';
import { daysIgnored } from '@/lib/db/queries';
import { isClosedStatus } from '@/lib/constants/statuses';
import { inferredRecordKind } from '@/lib/issues/recordKind';

export function DaysIgnoredBadge({ issue }: { issue: CivicIssue }) {
  const days = daysIgnored(issue);
  const kind = inferredRecordKind(issue);
  const label = kind === 'public_source'
    ? `${days} days since source report`
    : kind === 'illustrative_sample'
      ? `${days} sample days observed`
      : isClosedStatus(issue.status)
    ? issue.status === 'resolved'
      ? `Resolved after ${days} days`
      : `Closed after ${days} days`
    : `Observed for ${days} days`;
  return <span className="pill" style={{ borderColor: 'rgba(183,31,45,0.25)', color: 'var(--crimson)' }}>{label}</span>;
}
