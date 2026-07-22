import type { DashboardStats as DashboardStatsType } from '@/lib/types';

export function DashboardStats({ stats }: { stats: DashboardStatsType }) {
  const rows = [
    ['Tracked civic records', stats.totalIssues],
    ['Need follow-up', stats.unresolvedIssues],
    ['Reached signal threshold', stats.verifiedIssues],
    ['Marked resolved', stats.resolvedIssues],
    ['Average days observed', stats.averageDaysIgnored],
  ];
  return (
    <section className="metrics metrics-surface" aria-label="Civic record summary">
      <div className="stat-grid">
        {rows.map(([label, value], index) => (
          <div key={label} className={index === rows.length - 1 ? 'stat-card emphasized' : 'stat-card'}>
            <span className="stat-index mono">0{index + 1}</span>
            <p>{label}</p>
            <strong className="mono">{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
