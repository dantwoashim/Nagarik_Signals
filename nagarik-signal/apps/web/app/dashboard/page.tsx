import Link from 'next/link';
import { DashboardStats } from '@/components/DashboardStats';
import { IssueCard } from '@/components/IssueCard';
import { WardLeaderboard } from '@/components/WardLeaderboard';
import { categoryLabel } from '@/lib/constants/categories';
import { statusLabel } from '@/lib/constants/statuses';
import {
  categoryBreakdown,
  dashboardStats,
  listIssues,
  listVerifications,
  mostIgnoredIssues,
  recentResolvedIssues,
} from '@/lib/db/queries';
import { formatDateTime, shortText } from '@/lib/ui/format';

export default async function DashboardPage() {
  const [allIssues, samples, categories, ignoredIssues, resolvedIssues, allVerifications, stats] = await Promise.all([
    listIssues({ scope: 'public', sort: 'most_ignored', limit: 100 }),
    listIssues({ scope: 'samples', limit: 100 }),
    categoryBreakdown(),
    mostIgnoredIssues(5),
    recentResolvedIssues(5),
    listVerifications(),
    dashboardStats(),
  ]);
  const publicIssueIds = new Set(allIssues.map((issue) => issue.issueId));
  const verifications = allVerifications
    .filter((row) => publicIssueIds.has(row.issueId))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);
  const visibleIssues = allIssues.slice(0, 6);

  return (
    <section className="container page-section page-stack">
      <div className="page-heading">
        <span className="eyebrow">Accountability index</span>
        <h1>Where public follow-up is accumulating</h1>
        <p>An area-level view of current public records, verification signals, category pressure, source age, and status history. Samples and engineering fixtures are excluded from every number below.</p>
      </div>
      <DashboardStats stats={stats} liveCount={allIssues.length} sampleCount={samples.length} />
      <WardLeaderboard />
      <div className="dashboard-band">
        <section className="panel pad">
          <h2 style={{ marginTop: 0 }}>Category pressure</h2>
          <div className="table-list">
            {categories.map((row, index) => (
              <div className="table-row" key={row.category}>
                <span className="mono muted">#{index + 1}</span>
                <span>
                  <strong>{categoryLabel(row.category)}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: 13 }}>{row.unresolved} unresolved</span>
                </span>
                <strong>{row.total}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel pad">
          <h2 style={{ marginTop: 0 }}>Recent verification signals</h2>
          <div className="table-list">
            {verifications.length ? verifications.map((row, index) => (
              <div className="table-row" key={`${row.issueId}-${row.verifierPubkey}`}>
                <span className="mono muted">#{index + 1}</span>
                <span>
                  <strong>Issue #{row.issueId}</strong>
                  <span className="muted mono" style={{ display: 'block', fontSize: 12 }}>{shortText(row.verificationPda, 12, 8)}</span>
                </span>
                <span className="muted">{formatDateTime(row.createdAt)}</span>
              </div>
            )) : <p className="muted">No public verification signals indexed yet.</p>}
          </div>
        </section>
      </div>
      <div className="dashboard-band">
        <section className="panel pad">
          <h2 style={{ marginTop: 0 }}>Longest-observed open records</h2>
          <div className="table-list">
            {ignoredIssues.map((issue, index) => (
              <Link className="table-row" key={issue.id} href={`/issues/${issue.id}`}>
                <span className="mono muted">#{index + 1}</span>
                <span>
                  <strong>{issue.title}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: 13 }}>{statusLabel(issue.status)} in {issue.locality}</span>
                </span>
                <strong>{issue.daysIgnored} days</strong>
              </Link>
            ))}
          </div>
        </section>
        <section className="panel pad">
          <h2 style={{ marginTop: 0 }}>Resolved proof</h2>
          <div className="table-list">
            {resolvedIssues.length ? resolvedIssues.map((issue, index) => (
              <Link className="table-row" key={issue.id} href={`/issues/${issue.id}`}>
                <span className="mono muted">#{index + 1}</span>
                <span>
                  <strong>{issue.title}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: 13 }}>{issue.locality}</span>
                </span>
                <span className="pill status-resolved">resolved</span>
              </Link>
            )) : <p className="muted">No public record is currently marked resolved.</p>}
          </div>
        </section>
      </div>
      <div className="issue-grid">
        {visibleIssues.map((issue) => <IssueCard key={issue.id} issue={issue} />)}
      </div>
    </section>
  );
}
