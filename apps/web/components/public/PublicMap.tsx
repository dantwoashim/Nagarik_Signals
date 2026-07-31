'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowsOutSimple, MapPin, ShieldCheck } from '@phosphor-icons/react';
import type { GeoJSONSource, MapGeoJSONFeature, MapMouseEvent } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';

import { MapSurface, type MapSurfaceApi } from '@/components/maps/MapSurface';
import {
  categoryName,
  lifecycleLabel,
  publicPoint,
  publicWard,
  type PublicIssueSummary,
} from '@/lib/public/contracts';

const sourceId = 'nagarik-public-v2';
const clusterId = 'nagarik-public-v2-clusters';
const pointId = 'nagarik-public-v2-points';
const selectedId = 'nagarik-public-v2-selected';

type PointProperties = {
  publicId: string;
  lifecycle: string;
};

function featureCollection(
  issues: PublicIssueSummary[],
): FeatureCollection<Point, PointProperties> {
  return {
    type: 'FeatureCollection',
    features: issues.flatMap((issue) => {
      const point = publicPoint(issue.location);
      if (!point) return [];
      return [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [point.longitude, point.latitude],
          },
          properties: {
            publicId: issue.publicId,
            lifecycle: issue.lifecycle ?? issue.legacyStatus ?? 'open',
          },
        },
      ];
    }),
  };
}

function fitMap(api: MapSurfaceApi, issues: PublicIssueSummary[]) {
  const points = issues.flatMap((issue) => {
    const point = publicPoint(issue.location);
    return point ? [[point.longitude, point.latitude] as [number, number]] : [];
  });
  if (!points.length) return;
  const longitudes = points.map(([longitude]) => longitude);
  const latitudes = points.map(([, latitude]) => latitude);
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
  if (points.length === 1) {
    const [longitude, latitude] = points[0];
    bounds[0] = [longitude - 0.03, latitude - 0.03];
    bounds[1] = [longitude + 0.03, latitude + 0.03];
  }
  api.map.fitBounds(bounds, {
    padding: window.innerWidth < 720 ? 42 : { top: 64, right: 64, bottom: 64, left: 64 },
    maxZoom: 13.5,
    duration: api.reducedMotion ? 0 : 700,
  });
}

function addLayers(api: MapSurfaceApi, issues: PublicIssueSummary[], selectedPublicId: string) {
  const { map } = api;
  map.addSource(sourceId, {
    type: 'geojson',
    data: featureCollection(issues),
    cluster: true,
    clusterMaxZoom: 11,
    clusterRadius: 46,
  });
  map.addLayer({
    id: clusterId,
    type: 'circle',
    source: sourceId,
    filter: ['has', 'point_count'],
    paint: {
      'circle-radius': ['step', ['get', 'point_count'], 17, 8, 21, 20, 25],
      'circle-color': '#17201e',
      'circle-stroke-color': '#fffefc',
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: `${clusterId}-count`,
    type: 'symbol',
    source: sourceId,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-size': 12,
    },
    paint: { 'text-color': '#fffefc' },
  });
  map.addLayer({
    id: pointId,
    type: 'circle',
    source: sourceId,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 7, 14, 10],
      'circle-color': [
        'match',
        ['get', 'lifecycle'],
        'resolved',
        '#287052',
        'closed',
        '#287052',
        'in_progress',
        '#b06d18',
        '#ad2d39',
      ],
      'circle-stroke-color': '#fffefc',
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: selectedId,
    type: 'circle',
    source: sourceId,
    filter: ['==', ['get', 'publicId'], selectedPublicId],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 12, 14, 16],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': '#ad2d39',
      'circle-stroke-width': 3,
    },
  });
}

export function PublicMap({
  issues,
  compact = false,
}: {
  issues: PublicIssueSummary[];
  compact?: boolean;
}) {
  const mapped = useMemo(() => issues.filter((issue) => publicPoint(issue.location)), [issues]);
  const [currentId, setCurrentId] = useState(mapped[0]?.publicId ?? '');
  const apiRef = useRef<MapSurfaceApi | null>(null);
  const data = useMemo(() => featureCollection(mapped), [mapped]);
  const selected = issues.find((issue) => issue.publicId === currentId) ?? mapped[0] ?? issues[0];

  useEffect(() => {
    const source = apiRef.current?.map.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(data);
  }, [data]);

  useEffect(() => {
    const map = apiRef.current?.map;
    if (map?.getLayer(selectedId)) {
      map.setFilter(selectedId, ['==', ['get', 'publicId'], selected?.publicId ?? '']);
    }
  }, [selected?.publicId]);

  function focus(issue: PublicIssueSummary) {
    setCurrentId(issue.publicId);
    const point = publicPoint(issue.location);
    const api = apiRef.current;
    if (!point || !api) return;
    api.map.easeTo({
      center: [point.longitude, point.latitude],
      zoom: Math.max(api.map.getZoom(), 12.8),
      duration: api.reducedMotion ? 0 : 600,
    });
  }

  function ready(api: MapSurfaceApi | null) {
    apiRef.current = api;
    if (!api) return;
    addLayers(api, mapped, selected?.publicId ?? '');
    const { map } = api;
    const pointClick = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const publicId = String(event.features?.[0]?.properties?.publicId ?? '');
      const issue = issues.find((item) => item.publicId === publicId);
      if (issue) focus(issue);
    };
    const clusterClick = async (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== 'Point') return;
      const source = map.getSource(sourceId) as GeoJSONSource;
      const zoom = await source.getClusterExpansionZoom(Number(feature.properties?.cluster_id));
      map.easeTo({
        center: feature.geometry.coordinates as [number, number],
        zoom,
        duration: api.reducedMotion ? 0 : 500,
      });
    };
    const pointer = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const unpointer = () => {
      map.getCanvas().style.cursor = '';
    };
    map.on('click', pointId, pointClick);
    map.on('click', clusterId, clusterClick);
    map.on('mouseenter', pointId, pointer);
    map.on('mouseleave', pointId, unpointer);
    map.on('mouseenter', clusterId, pointer);
    map.on('mouseleave', clusterId, unpointer);
    window.requestAnimationFrame(() => fitMap(api, mapped));
  }

  if (!issues.length) return null;
  const ward = selected ? publicWard(selected.ward) : null;
  const state = selected?.lifecycle ?? selected?.legacyStatus ?? 'open';

  return (
    <section className={`prod-map ${compact ? 'prod-map-compact' : ''}`}>
      <div className="prod-map-canvas">
        {mapped.length ? (
          <MapSurface
            ariaLabel={`Map of ${mapped.length} approximate civic issue locations`}
            className="prod-map-surface"
            initialCenter={[85.324, 27.708]}
            initialZoom={7}
            minZoom={5}
            deferUntilVisible={compact}
            onMapReady={ready}
          >
            <div className="prod-map-privacy">
              <ShieldCheck size={14} weight="bold" aria-hidden="true" />
              Approximate locations
            </div>
            <button
              className="map-tool-button prod-map-fit"
              type="button"
              aria-label="Fit all records on map"
              title="Fit all records"
              onClick={() => {
                if (apiRef.current) fitMap(apiRef.current, mapped);
              }}
            >
              <ArrowsOutSimple size={18} weight="bold" />
            </button>
          </MapSurface>
        ) : (
          <div className="prod-map-no-location">Mapped locations are currently unavailable.</div>
        )}
      </div>

      {selected ? (
        <aside className="prod-map-rail" aria-live="polite">
          <label className="prod-map-select">
            <span>Visible record</span>
            <select
              value={selected.publicId}
              onChange={(event) => {
                const issue = issues.find((item) => item.publicId === event.target.value);
                if (issue) focus(issue);
              }}
            >
              {issues.map((issue) => (
                <option key={issue.publicId} value={issue.publicId}>
                  {issue.title ?? 'Public civic record'}
                </option>
              ))}
            </select>
          </label>
          <div className="prod-map-preview">
            <div className="prod-map-preview-media">
              {selected.mediaUrl ? (
                <Image
                  src={selected.mediaUrl}
                  alt=""
                  fill
                  sizes="(max-width: 900px) 100vw, 330px"
                />
              ) : (
                <span className="prod-record-media-empty" aria-hidden="true" />
              )}
              <span className={`prod-state prod-state-${state}`}>{lifecycleLabel(selected)}</span>
            </div>
            <div className="prod-map-preview-copy">
              <span>
                <MapPin size={15} weight="fill" aria-hidden="true" />
                {ward?.label ?? 'Approximate area'}
              </span>
              <h3>{selected.title ?? 'Public civic record'}</h3>
              <p>
                {selected.summary ??
                  'Open the record for its reviewed evidence and public history.'}
              </p>
              <dl>
                <div>
                  <dt>Category</dt>
                  <dd>{categoryName(selected.category)}</dd>
                </div>
                <div>
                  <dt>Signals</dt>
                  <dd>{selected.signalCount}</dd>
                </div>
              </dl>
              <Link href={`/issues/${selected.publicId}`}>
                Open record <ArrowRight size={16} weight="bold" />
              </Link>
            </div>
          </div>
        </aside>
      ) : null}
    </section>
  );
}
