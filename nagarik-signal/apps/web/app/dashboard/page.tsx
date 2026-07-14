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

export default function DashboardPage() {
  const allIssues = listIssues({ sort: 'most_ignored', limit: 100 });
  const liveCount = allIssues.filter((issue) => issue.proof.proofStatus !== 'seeded_demo').length;
  const demoCount = allIssues.length - liveCount;
  const categories = categoryBreakdown();
  const ignoredIssues = mostIgnoredIssues(5);
  const resolvedIssues = recentResolvedIssues(5);
  const verifications = listVerifications()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);
  const visibleIssues = listIssues({ sort: 'most_ignored', limit: 6 });

  return (
    <section className="container page-section page-stack">
      <div className="page-heading">
        <span className="eyebrow">Accountability index</span>
        <h1>Where public problems wait longest</h1>
        <p>A ward-level view of unresolved records, citizen verification, category pressure, and resolution evidence. Counts include the clearly marked demo dataset; live devnet scope is shown separately.</p>
      </div>
      <DashboardStats stats={dashboardStats()} liveCount={liveCount} demoCount={demoCount} />
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
          <h2 style={{ marginTop: 0 }}>Recent verifications</h2>
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
            )) : <p className="muted">No citizen verification PDAs indexed yet.</p>}
          </div>
        </section>
      </div>
      <div className="dashboard-band">
        <section className="panel pad">
          <h2 style={{ marginTop: 0 }}>Most ignored open issues</h2>
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
            )) : <p className="muted">No resolved issue proof indexed yet.</p>}
          </div>
        </section>
      </div>
      <div className="issue-grid">
        {visibleIssues.map((issue) => <IssueCard key={issue.id} issue={issue} />)}
      </div>
    </section>
  );
}
