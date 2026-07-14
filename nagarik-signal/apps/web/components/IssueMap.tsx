'use client';

import { ArrowSquareOut, MapPin, ShieldCheck } from '@phosphor-icons/react';
import type { FeatureCollection, Point } from 'geojson';
import { MapSurface, type MapSurfaceApi } from '@/components/maps/MapSurface';
import { publicLocationCircle, publicLocationRadiusMeters } from '@/lib/geo/map';
import type { CivicIssue } from '@/lib/types';

const areaSourceId = 'nagarik-public-area';
const pointSourceId = 'nagarik-public-point';

function addIssueLocation(api: MapSurfaceApi, issue: CivicIssue) {
  const { map } = api;
  map.addSource(areaSourceId, {
    type: 'geojson',
    data: publicLocationCircle(issue.latDisplay, issue.lngDisplay),
  });
  map.addLayer({
    id: 'nagarik-public-area-fill',
    type: 'fill',
    source: areaSourceId,
    paint: {
      'fill-color': '#b52f3d',
      'fill-opacity': 0.11,
    },
  });
  map.addLayer({
    id: 'nagarik-public-area-line',
    type: 'line',
    source: areaSourceId,
    paint: {
      'line-color': '#b52f3d',
      'line-opacity': 0.7,
      'line-width': 1.5,
      'line-dasharray': [2, 2],
    },
  });

  const point: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [issue.lngDisplay, issue.latDisplay] },
    }],
  };
  map.addSource(pointSourceId, { type: 'geojson', data: point });
  map.addLayer({
    id: 'nagarik-public-point-halo',
    type: 'circle',
    source: pointSourceId,
    paint: {
      'circle-radius': 18,
      'circle-color': 'rgba(181, 47, 61, 0.18)',
      'circle-blur': 0.35,
    },
  });
  map.addLayer({
    id: 'nagarik-public-point-dot',
    type: 'circle',
    source: pointSourceId,
    paint: {
      'circle-radius': 7,
      'circle-color': '#b52f3d',
      'circle-stroke-color': '#fffefc',
      'circle-stroke-width': 2,
    },
  });
}

export function IssueMap({ issue }: { issue: CivicIssue }) {
  const osmUrl = `https://www.openstreetmap.org/?mlat=${issue.latDisplay.toFixed(3)}&mlon=${issue.lngDisplay.toFixed(3)}#map=15/${issue.latDisplay.toFixed(3)}/${issue.lngDisplay.toFixed(3)}`;

  return (
    <section className="issue-location-map" aria-labelledby="issue-map-heading">
      <MapSurface
        ariaLabel={`Detailed map of the approximate public location for ${issue.title}`}
        className="issue-map-surface"
        deferUntilVisible
        initialCenter={[issue.lngDisplay, issue.latDisplay]}
        initialZoom={14.2}
        minZoom={7}
        onMapReady={(api) => api && addIssueLocation(api, issue)}
      >
        <div className="issue-map-label">
          <span className="eyebrow"><ShieldCheck size={14} weight="bold" />Approximate public area</span>
          <h2 id="issue-map-heading">{issue.locality}</h2>
          <p>The marked area communicates uncertainty. It does not identify the reporter or an exact property.</p>
        </div>
        <div className="issue-map-radius"><MapPin size={15} weight="fill" />~{publicLocationRadiusMeters} m public area</div>
      </MapSurface>
      <footer className="issue-map-footer">
        <div>
          <span>Rounded public point</span>
          <code className="mono">{issue.latDisplay.toFixed(3)}, {issue.lngDisplay.toFixed(3)}</code>
        </div>
        {issue.geohash ? <div><span>Coarse geohash</span><code className="mono">{issue.geohash}</code></div> : null}
        <a href={osmUrl} target="_blank" rel="noreferrer">Inspect map data <ArrowSquareOut size={16} weight="bold" /></a>
      </footer>
    </section>
  );
}
