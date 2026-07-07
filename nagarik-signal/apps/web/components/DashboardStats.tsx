import type { DashboardStats as DashboardStatsType } from '@/lib/types';

export function DashboardStats({ stats }: { stats: DashboardStatsType }) {
  const rows = [
    ['Issues proven', stats.totalIssues],
    ['Unresolved', stats.unresolvedIssues],
    ['Verified', stats.verifiedIssues],
    ['Resolved', stats.resolvedIssues],
    ['Avg days ignored', stats.averageDaysIgnored],
  ];
  return (
    <section className="stat-grid">
      {rows.map(([label, value]) => (
        <div key={label} className="panel stat-card">
          <p>{label}</p>
          <strong className="mono">{value}</strong>
        </div>
      ))}
    </section>
  );
}
