import Link from 'next/link';
import { statusLabel } from '@/lib/constants/statuses';
import type { CivicIssue } from '@/lib/types';

export function ExploreMap({ issues }: { issues: CivicIssue[] }) {
  return (
    <section className="panel map-panel" aria-label="Coarse issue map">
      <div className="map-panel-inner" style={{ alignItems: 'stretch' }}>
        <div style={{ width: '100%', display: 'grid', gap: 12 }}>
          <div>
            <strong>Coarse public map</strong>
            <p className="muted" style={{ marginBottom: 0 }}>
              Pins use ward/locality-level display coordinates, not reporter GPS.
            </p>
          </div>
          <div className="table-list">
            {issues.slice(0, 6).map((issue, index) => (
              <Link className="table-row" key={issue.id} href={`/issues/${issue.id}`}>
                <span className="mono muted">#{index + 1}</span>
                <span>
                  <strong>{issue.locality}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: 13 }}>{issue.title}</span>
                </span>
                <span className={`pill status-${issue.status}`}>{statusLabel(issue.status)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
