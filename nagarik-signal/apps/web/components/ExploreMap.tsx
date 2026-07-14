import Link from 'next/link';
import { MapPin } from '@phosphor-icons/react/dist/ssr';
import { statusLabel } from '@/lib/constants/statuses';
import type { CivicIssue } from '@/lib/types';
import { inferredRecordKind, recordKindLabel } from '@/lib/issues/recordKind';

export function ExploreMap({ issues }: { issues: CivicIssue[] }) {
  const visible = issues.slice(0, 14);
  const latitudes = visible.map((issue) => issue.latDisplay);
  const longitudes = visible.map((issue) => issue.lngDisplay);
  const minLat = Math.min(...latitudes, 27.64);
  const maxLat = Math.max(...latitudes, 27.73);
  const minLng = Math.min(...longitudes, 85.28);
  const maxLng = Math.max(...longitudes, 85.38);
  const latSpan = Math.max(maxLat - minLat, 0.02);
  const lngSpan = Math.max(maxLng - minLng, 0.02);

  return (
    <section className="coarse-map" aria-labelledby="coarse-map-title">
      <div className="coarse-map-copy">
        <span className="eyebrow">Approximate geography</span>
        <h2 id="coarse-map-title">Where public follow-up is gathering</h2>
        <p>Pins show rounded public coordinates. Source dossiers may cover a corridor or service area rather than one point.</p>
        <div className="map-key">
          <span><i className="map-key-dot live" />Public record</span>
          <span><i className="map-key-dot sample" />Illustrative sample</span>
        </div>
        <div className="map-list">
          {visible.slice(0, 4).map((issue) => (
            <Link key={issue.id} href={`/issues/${issue.id}`}>
              <span>{issue.locality}</span>
              <strong>{issue.title}</strong>
              <small>{statusLabel(issue.status)}</small>
            </Link>
          ))}
        </div>
      </div>
      <div className="map-canvas" aria-label={`${visible.length} approximate civic issue locations`}>
        <span className="map-district-label label-one">Nepal civic watch</span>
        {visible.map((issue, index) => {
          const left = 9 + ((issue.lngDisplay - minLng) / lngSpan) * 78;
          const top = 10 + (1 - ((issue.latDisplay - minLat) / latSpan)) * 74;
          const kind = inferredRecordKind(issue);
          const live = kind === 'community_report' || kind === 'public_source';
          return (
            <Link
              key={issue.id}
              href={`/issues/${issue.id}`}
              className={live ? 'map-marker live' : 'map-marker sample'}
              style={{ left: `${Math.min(88, Math.max(8, left))}%`, top: `${Math.min(84, Math.max(8, top))}%`, '--marker-index': index } as React.CSSProperties}
              aria-label={`${issue.title}, ${issue.locality}, ${recordKindLabel(issue)}`}
              title={`${issue.locality}: ${issue.title}`}
            >
              <MapPin size={18} weight="fill" aria-hidden="true" />
            </Link>
          );
        })}
        {!visible.length ? (
          <div className="empty-state compact">
            <strong>No locations match these filters</strong>
            <span>Reset the filters to restore the public record.</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
