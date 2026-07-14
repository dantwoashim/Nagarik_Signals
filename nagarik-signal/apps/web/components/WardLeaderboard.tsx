import { wardLeaderboard } from '@/lib/db/queries';

export async function WardLeaderboard() {
  const rows = await wardLeaderboard();
  return (
    <section className="panel pad">
      <h2 style={{ marginTop: 0 }}>Area follow-up index</h2>
      <div className="table-list">
        {rows.map((row, index) => (
          <div key={row.wardId} className="table-row">
            <span className="mono muted">#{index + 1}</span>
            <span>
              <strong>{row.locality}</strong>
              <span className="muted" style={{ display: 'block', fontSize: 13 }}>
                {row.unresolved} unresolved / {row.total} total
              </span>
              {row.mostIgnoredIssue ? (
                <span className="muted" style={{ display: 'block', fontSize: 13 }}>
                  Longest observed: {row.mostIgnoredIssue.title}
                </span>
              ) : null}
            </span>
            <strong>{row.averageDaysIgnored} avg days</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
