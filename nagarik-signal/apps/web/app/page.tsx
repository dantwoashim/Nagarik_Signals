import Link from 'next/link';
import { DashboardStats } from '@/components/DashboardStats';
import { IssueCard } from '@/components/IssueCard';
import { dashboardStats, listIssues, mostIgnoredIssues } from '@/lib/db/queries';
import { appConfig } from '@/lib/constants/config';

export default function HomePage() {
  const stats = dashboardStats();
  const ignoredIssues = mostIgnoredIssues(3);
  const issues = ignoredIssues.length ? ignoredIssues : listIssues({ limit: 3 });
  return (
    <div>
      <section className="hero">
        <div className="container hero-content">
          <span className="eyebrow">Solana-backed civic proof</span>
          <h1>{appConfig.tagline}</h1>
          <p>{appConfig.positioning}</p>
          <div className="hero-actions" style={{ marginTop: 28 }}>
            <Link className="button crimson" href="/report">Report an issue</Link>
            <Link className="button secondary" href="/dashboard">View dashboard</Link>
          </div>
        </div>
      </section>
      <section className="container page-stack" style={{ padding: '28px 0 80px' }}>
        <DashboardStats stats={stats} />
        <div className="dashboard-band">
          <section className="panel pad">
            <h2 style={{ marginTop: 0 }}>Complaints disappear. Proofs do not.</h2>
            <p className="muted" style={{ lineHeight: 1.65 }}>
              Nagarik Signal records public infrastructure reports as proof objects: sanitized evidence, canonical metadata hash, location commitment, Issue PDA, citizen verification, and steward status timeline.
            </p>
            <div className="row-actions">
              <Link className="button secondary" href="/explore">Browse proof objects</Link>
              <Link className="button secondary" href="/steward">Open steward console</Link>
            </div>
          </section>
          <section className="panel pad">
            <h2 style={{ marginTop: 0 }}>Why Solana here</h2>
            <p className="muted" style={{ lineHeight: 1.65 }}>
              The chain is not decoration. It provides a public timestamp, committed hashes, duplicate-resistant Verification PDAs, and StatusUpdate PDAs that make the timeline auditable.
            </p>
          </section>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Featured ignored issues</h2>
            <p className="muted">Each card is a public proof object with status, hashes, and a public issue page.</p>
          </div>
          <Link className="button secondary" href="/explore">Explore all</Link>
        </div>
        <div className="grid-auto">
          {issues.map((issue) => <IssueCard key={issue.id} issue={issue} />)}
        </div>
      </section>
    </div>
  );
}
