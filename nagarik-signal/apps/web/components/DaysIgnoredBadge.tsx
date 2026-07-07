import type { CivicIssue } from '@/lib/types';
import { daysIgnored } from '@/lib/db/queries';
import { isClosedStatus } from '@/lib/constants/statuses';

export function DaysIgnoredBadge({ issue }: { issue: CivicIssue }) {
  const days = daysIgnored(issue);
  const label = isClosedStatus(issue.status)
    ? issue.status === 'resolved'
      ? `Resolved after ${days} days`
      : `Closed after ${days} days`
    : `Ignored for ${days} days`;
  return <span className="pill" style={{ borderColor: 'rgba(183,31,45,0.25)', color: 'var(--crimson)' }}>{label}</span>;
}
