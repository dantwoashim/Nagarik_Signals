import type { DashboardStats as DashboardStatsType } from '@/lib/types';

export function DashboardStats({
  stats,
  liveCount,
  demoCount,
}: {
  stats: DashboardStatsType;
  liveCount?: number;
  demoCount?: number;
}) {
  const rows = [
    ['Public records', stats.totalIssues],
    ['Still open', stats.unresolvedIssues],
    ['Citizen verified', stats.verifiedIssues],
    ['Resolved with proof', stats.resolvedIssues],
    ['Average days ignored', stats.averageDaysIgnored],
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
      {typeof liveCount === 'number' && typeof demoCount === 'number' ? (
        <p className="proof-scope"><strong>{liveCount} live devnet</strong><span aria-hidden="true">/</span>{demoCount} clearly marked demo records</p>
      ) : null}
    </section>
  );
}
