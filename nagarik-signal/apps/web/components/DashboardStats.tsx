import type { DashboardStats as DashboardStatsType } from '@/lib/types';

export function DashboardStats({
  stats,
  liveCount,
  sampleCount,
}: {
  stats: DashboardStatsType;
  liveCount?: number;
  sampleCount?: number;
}) {
  const rows = [
    ['Tracked civic records', stats.totalIssues],
    ['Need follow-up', stats.unresolvedIssues],
    ['Reached signal threshold', stats.verifiedIssues],
    ['Marked resolved', stats.resolvedIssues],
    ['Average days observed', stats.averageDaysIgnored],
  ];
  return (
    <section className="metrics" aria-label="Civic record summary">
      <div className="stat-grid">
        {rows.map(([label, value], index) => (
          <div key={label} className={index === rows.length - 1 ? 'stat-card emphasized' : 'stat-card'}>
          <p>{label}</p>
          <strong className="mono">{value}</strong>
          </div>
        ))}
      </div>
      {typeof liveCount === 'number' && typeof sampleCount === 'number' ? (
        <p className="proof-scope"><strong>{liveCount} public records anchored on devnet</strong><span aria-hidden="true">/</span>{sampleCount} illustrative samples kept outside these totals</p>
      ) : null}
    </section>
  );
}
