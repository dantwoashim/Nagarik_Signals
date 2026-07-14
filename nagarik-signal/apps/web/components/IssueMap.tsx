import type { CivicIssue } from '@/lib/types';
import { MapPin, ShieldCheck } from '@phosphor-icons/react/dist/ssr';

export function IssueMap({ issue }: { issue: CivicIssue }) {
  return (
    <section className="panel map-panel" aria-label="Approximate public location">
      <div className="map-panel-inner">
        <div className="map-panel-visual" aria-hidden="true">
          <span className="map-axis horizontal" />
          <span className="map-axis vertical" />
          <span className="map-target-ring" />
          <MapPin className="map-panel-pin" size={30} weight="fill" />
        </div>
        <div className="map-panel-copy">
          <span className="eyebrow"><ShieldCheck size={14} weight="bold" />Approximate location</span>
          <strong>{issue.locality}</strong>
          <p className="muted">The public point is intentionally coarse. Exact reporter location is never stored or displayed.</p>
          <code className="mono">{issue.latDisplay.toFixed(3)}, {issue.lngDisplay.toFixed(3)}</code>
          {issue.geohash ? <span className="mono muted">coarse geohash: {issue.geohash}</span> : null}
        </div>
      </div>
    </section>
  );
}
