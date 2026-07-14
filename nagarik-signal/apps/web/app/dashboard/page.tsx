import Link from 'next/link';
import { ArrowRight, CheckCircle, Pulse } from '@phosphor-icons/react/dist/ssr';
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
  const visibleIssues = allIssues.slice(0, 4);
  const maxCategoryTotal = Math.max(1, ...categories.map((row) => row.total));

  return (
    <section className="container page-section page-stack dashboard-page">
      <div className="page-heading dashboard-heading">
        <span className="eyebrow">Accountability index</span>
        <h1>Where public follow-up is accumulating</h1>
        <p>An area-level view of current public records, verification signals, category pressure, source age, and status history. Samples and engineering fixtures are excluded from every number below.</p>
      </div>

      <DashboardStats stats={stats} liveCount={allIssues.length} sampleCount={samples.length} />
      <WardLeaderboard />

      <div className="dashboard-intelligence-grid">
        <section className="dashboard-data-section category-pressure" aria-labelledby="category-pressure-heading">
          <div className="dashboard-section-heading compact">
            <div><span className="eyebrow">Category pressure</span><h2 id="category-pressure-heading">Open records by public asset</h2></div>
          </div>
          <div className="category-pressure-list">
            {categories.map((row, index) => (
              <div className="category-pressure-row" key={row.category}>
                <span className="mono muted">0{index + 1}</span>
                <strong>{categoryLabel(row.category)}</strong>
                <span className="category-pressure-bar" aria-hidden="true"><i style={{ transform: `scaleX(${row.total / maxCategoryTotal})` }} /></span>
                <span className="category-pressure-count"><strong className="mono">{row.unresolved}</strong> open / {row.total}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="dashboard-data-section signal-stream" aria-labelledby="signal-stream-heading">
          <div className="dashboard-section-heading compact">
            <div><span className="eyebrow"><Pulse size={14} weight="bold" />Public signals</span><h2 id="signal-stream-heading">Latest corroboration</h2></div>
          </div>
          <div className="signal-stream-list">
            {verifications.length ? verifications.map((row) => (
              <div className="signal-stream-row" key={`${row.issueId}-${row.verifierPubkey}`}>
                <span className="signal-stream-icon"><CheckCircle size={18} weight="fill" /></span>
                <span><strong>Issue #{row.issueId}</strong><code className="mono">{shortText(row.verificationPda, 10, 7)}</code></span>
                <time>{formatDateTime(row.createdAt)}</time>
              </div>
            )) : <div className="empty-state compact"><strong>No public signals yet.</strong><span>Corroboration activity will appear here.</span></div>}
          </div>
        </section>
      </div>

      <div className="dashboard-followup-grid">
        <section className="dashboard-data-section" aria-labelledby="longest-open-heading">
          <div className="dashboard-section-heading compact">
            <div><span className="eyebrow">Needs attention</span><h2 id="longest-open-heading">Longest-observed open records</h2></div>
          </div>
          <div className="followup-list">
            {ignoredIssues.map((issue, index) => (
              <Link className="followup-row" key={issue.id} href={`/issues/${issue.id}`}>
                <span className="mono">0{index + 1}</span>
                <span><strong>{issue.title}</strong><small>{statusLabel(issue.status)} / {issue.locality}</small></span>
                <span className="followup-days"><strong className="mono">{issue.daysIgnored}</strong><small>days</small></span>
                <ArrowRight size={17} weight="bold" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>

        <section className="dashboard-data-section" aria-labelledby="resolved-heading">
          <div className="dashboard-section-heading compact">
            <div><span className="eyebrow">Resolution trail</span><h2 id="resolved-heading">Resolved proof</h2></div>
          </div>
          {resolvedIssues.length ? (
            <div className="followup-list resolved-list">
              {resolvedIssues.map((issue, index) => (
                <Link className="followup-row" key={issue.id} href={`/issues/${issue.id}`}>
                  <span className="mono">0{index + 1}</span>
                  <span><strong>{issue.title}</strong><small>{issue.locality}</small></span>
                  <span className="pill status-resolved">Resolved</span>
                  <ArrowRight size={17} weight="bold" aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty-resolution">
              <CheckCircle size={26} weight="regular" />
              <strong>No public record is marked resolved yet.</strong>
              <span>The first after-state artifact and status proof will appear here.</span>
            </div>
          )}
        </section>
      </div>

      <section className="dashboard-records" aria-labelledby="dashboard-records-heading">
        <div className="dashboard-section-heading">
          <div><span className="eyebrow">Open the record</span><h2 id="dashboard-records-heading">Inspect the issues behind the index</h2></div>
          <Link className="text-link" href="/explore">View all public records <ArrowRight size={16} weight="bold" /></Link>
        </div>
        <div className="issue-list dashboard-issue-list">
          {visibleIssues.map((issue) => <IssueCard key={issue.id} issue={issue} variant="ledger" />)}
        </div>
      </section>
    </section>
  );
}
