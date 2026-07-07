import type { CivicIssue } from '@/lib/types';

export function IssueMap({ issue }: { issue: CivicIssue }) {
  return (
    <section className="panel map-panel" aria-label="Approximate public location">
      <div className="map-panel-inner">
        <div>
          <div className="map-pin" />
          <strong>{issue.locality}</strong>
          <p className="muted">Approximate public location only. Exact reporter location is not stored or displayed.</p>
          <code className="mono">{issue.latDisplay.toFixed(3)}, {issue.lngDisplay.toFixed(3)}</code>
          {issue.geohash ? <p className="mono muted">coarse geohash: {issue.geohash}</p> : null}
        </div>
      </div>
    </section>
  );
}
