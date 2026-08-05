'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowSquareOut,
  ArrowsOutSimple,
  Broadcast,
  MapPin,
  ShieldCheck,
} from '@phosphor-icons/react';
import type { GeoJSONSource, MapGeoJSONFeature, MapMouseEvent } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';

import { MapSurface, type MapSurfaceApi } from '@/components/maps/MapSurface';
import { readPublicApi } from '@/lib/public/api';
import {
  categoryName,
  lifecycleLabel,
  publicPoint,
  publicWard,
  type OfficialAlert,
  type PublicIssueSummary,
} from '@/lib/public/contracts';

const sourceId = 'nagarik-public-v2';
const clusterId = 'nagarik-public-v2-clusters';
const pointId = 'nagarik-public-v2-points';
const selectedId = 'nagarik-public-v2-selected';
const alertSourceId = 'nagarik-official-alerts';
const alertPointId = 'nagarik-official-alert-points';
const selectedAlertId = 'nagarik-official-alert-selected';

type PointProperties = {
  publicId: string;
  lifecycle: string;
};

type AlertPointProperties = {
  alertId: string;
  status: OfficialAlert['status'];
};

type Selection = { kind: 'record' | 'alert'; id: string };

type AlertResponse = {
  items: OfficialAlert[];
  checkedAt: string;
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

function alertFeatureCollection(
  alerts: OfficialAlert[],
): FeatureCollection<Point, AlertPointProperties> {
  return {
    type: 'FeatureCollection',
    features: alerts.map((alert) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [alert.longitude, alert.latitude],
      },
      properties: { alertId: alert.id, status: alert.status },
    })),
  };
}

function fitMap(api: MapSurfaceApi, issues: PublicIssueSummary[], alerts: OfficialAlert[]) {
  const points = [
    ...issues.flatMap((issue) => {
      const point = publicPoint(issue.location);
      return point ? [[point.longitude, point.latitude] as [number, number]] : [];
    }),
    ...alerts.map((alert) => [alert.longitude, alert.latitude] as [number, number]),
  ];
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
    duration: api.reducedMotion ? 0 : 550,
  });
}

function addLayers(
  api: MapSurfaceApi,
  issues: PublicIssueSummary[],
  alerts: OfficialAlert[],
  selectedPublicIdValue: string,
  selectedAlertIdValue: string,
) {
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
    filter: ['==', ['get', 'publicId'], selectedPublicIdValue],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 12, 14, 16],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': '#ad2d39',
      'circle-stroke-width': 3,
    },
  });

  map.addSource(alertSourceId, {
    type: 'geojson',
    data: alertFeatureCollection(alerts),
  });
  map.addLayer({
    id: alertPointId,
    type: 'circle',
    source: alertSourceId,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 6, 14, 9],
      'circle-color': [
        'match',
        ['get', 'status'],
        'resolved',
        '#287052',
        'recheck_due',
        '#b06d18',
        'reported',
        '#246585',
        '#d22f42',
      ],
      'circle-stroke-color': '#17201e',
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: selectedAlertId,
    type: 'circle',
    source: alertSourceId,
    filter: ['==', ['get', 'alertId'], selectedAlertIdValue],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 11, 14, 15],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': '#17201e',
      'circle-stroke-width': 3,
    },
  });
}

function alertStatusLabel(status: OfficialAlert['status']): string {
  if (status === 'active') return 'Active alert';
  if (status === 'resolved') return 'Reopened';
  if (status === 'recheck_due') return 'Recheck due';
  return 'Reported';
}

function alertStateClass(status: OfficialAlert['status']): string {
  if (status === 'resolved') return 'resolved';
  if (status === 'recheck_due') return 'in_progress';
  return 'open';
}

function ageLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${hours === 1 ? '' : 's'} ago`;
}

export function PublicMap({
  issues,
  compact = false,
}: {
  issues: PublicIssueSummary[];
  compact?: boolean;
}) {
  const mapped = useMemo(() => issues.filter((issue) => publicPoint(issue.location)), [issues]);
  const [alerts, setAlerts] = useState<OfficialAlert[]>([]);
  const [selection, setSelection] = useState<Selection | null>(
    mapped[0] ? { kind: 'record', id: mapped[0].publicId } : null,
  );
  const apiRef = useRef<MapSurfaceApi | null>(null);
  const data = useMemo(() => featureCollection(mapped), [mapped]);
  const alertData = useMemo(() => alertFeatureCollection(alerts), [alerts]);
  const selectionIsValid =
    (selection?.kind === 'record' && issues.some((issue) => issue.publicId === selection.id)) ||
    (selection?.kind === 'alert' && alerts.some((alert) => alert.id === selection.id));
  const effectiveSelection: Selection | null = selectionIsValid
    ? selection
    : mapped[0]
      ? { kind: 'record', id: mapped[0].publicId }
      : alerts[0]
        ? { kind: 'alert', id: alerts[0].id }
        : issues[0]
          ? { kind: 'record', id: issues[0].publicId }
          : null;
  const selectedIssue =
    effectiveSelection?.kind === 'record'
      ? issues.find((issue) => issue.publicId === effectiveSelection.id)
      : undefined;
  const selectedAlert =
    effectiveSelection?.kind === 'alert'
      ? alerts.find((alert) => alert.id === effectiveSelection.id)
      : undefined;
  const hasSelection = Boolean(selectedIssue || selectedAlert);

  useEffect(() => {
    const controller = new AbortController();
    readPublicApi<AlertResponse>('/api/v2/official-alerts', { signal: controller.signal })
      .then((result) => setAlerts(result.items))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const source = apiRef.current?.map.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(data);
  }, [data]);

  useEffect(() => {
    const source = apiRef.current?.map.getSource(alertSourceId) as GeoJSONSource | undefined;
    source?.setData(alertData);
  }, [alertData]);

  useEffect(() => {
    const map = apiRef.current?.map;
    if (map?.getLayer(selectedId)) {
      map.setFilter(selectedId, ['==', ['get', 'publicId'], selectedIssue?.publicId ?? '']);
    }
    if (map?.getLayer(selectedAlertId)) {
      map.setFilter(selectedAlertId, ['==', ['get', 'alertId'], selectedAlert?.id ?? '']);
    }
  }, [selectedAlert?.id, selectedIssue?.publicId]);

  function focusIssue(issue: PublicIssueSummary) {
    setSelection({ kind: 'record', id: issue.publicId });
    const point = publicPoint(issue.location);
    const api = apiRef.current;
    if (!point || !api) return;
    api.map.easeTo({
      center: [point.longitude, point.latitude],
      zoom: Math.max(api.map.getZoom(), 12.8),
      duration: api.reducedMotion ? 0 : 450,
    });
  }

  function focusAlert(alert: OfficialAlert) {
    setSelection({ kind: 'alert', id: alert.id });
    const api = apiRef.current;
    if (!api) return;
    api.map.easeTo({
      center: [alert.longitude, alert.latitude],
      zoom: Math.max(api.map.getZoom(), 11.8),
      duration: api.reducedMotion ? 0 : 450,
    });
  }

  function ready(api: MapSurfaceApi | null) {
    apiRef.current = api;
    if (!api) return;
    addLayers(api, mapped, alerts, selectedIssue?.publicId ?? '', selectedAlert?.id ?? '');
    const { map } = api;
    const pointClick = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const publicId = String(event.features?.[0]?.properties?.publicId ?? '');
      const issue = issues.find((item) => item.publicId === publicId);
      if (issue) focusIssue(issue);
    };
    const alertClick = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const alertId = String(event.features?.[0]?.properties?.alertId ?? '');
      const alert = alerts.find((item) => item.id === alertId);
      if (alert) focusAlert(alert);
    };
    const clusterClick = async (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== 'Point') return;
      const source = map.getSource(sourceId) as GeoJSONSource;
      const zoom = await source.getClusterExpansionZoom(Number(feature.properties?.cluster_id));
      map.easeTo({
        center: feature.geometry.coordinates as [number, number],
        zoom,
        duration: api.reducedMotion ? 0 : 400,
      });
    };
    const pointer = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const unpointer = () => {
      map.getCanvas().style.cursor = '';
    };
    map.on('click', pointId, pointClick);
    map.on('click', alertPointId, alertClick);
    map.on('click', clusterId, clusterClick);
    for (const layer of [pointId, alertPointId, clusterId]) {
      map.on('mouseenter', layer, pointer);
      map.on('mouseleave', layer, unpointer);
    }
    window.requestAnimationFrame(() => fitMap(api, mapped, alerts));
  }

  const ward = selectedIssue ? publicWard(selectedIssue.ward) : null;
  const state = selectedIssue?.lifecycle ?? selectedIssue?.legacyStatus ?? 'open';
  const mappedItemCount = mapped.length + alerts.length;

  return (
    <section
      className={`prod-map ${compact ? 'prod-map-compact' : ''} ${hasSelection ? '' : 'prod-map-empty'}`}
    >
      <div className="prod-map-canvas">
        <MapSurface
          ariaLabel={
            mappedItemCount
              ? `Map of ${mappedItemCount} public civic locations and official alerts`
              : 'Public civic issue map of Nepal'
          }
          className="prod-map-surface"
          initialCenter={mappedItemCount ? [85.324, 27.708] : [84.1, 28.2]}
          initialZoom={mappedItemCount ? 7 : 5.8}
          minZoom={5}
          deferUntilVisible={compact}
          onMapReady={ready}
        >
          <div className="prod-map-privacy">
            <ShieldCheck size={14} weight="bold" aria-hidden="true" />
            Approximate locations
          </div>
          {alerts.length ? (
            <div className="prod-map-live-badge">
              <span aria-hidden="true" />
              {alerts.length} official alert{alerts.length === 1 ? '' : 's'}
            </div>
          ) : null}
          {mappedItemCount ? (
            <button
              className="map-tool-button prod-map-fit"
              type="button"
              aria-label="Fit all map items"
              title="Fit all map items"
              onClick={() => {
                if (apiRef.current) fitMap(apiRef.current, mapped, alerts);
              }}
            >
              <ArrowsOutSimple size={18} weight="bold" />
            </button>
          ) : (
            <div className="prod-map-empty-note" role="status">
              <strong>
                {issues.length ? 'No public location available' : 'No published records yet'}
              </strong>
              <span>
                {issues.length
                  ? 'These records do not expose an approximate location.'
                  : 'Reviewed records will appear here.'}
              </span>
              {!issues.length ? <Link href="/report">Report an issue</Link> : null}
            </div>
          )}
        </MapSurface>
      </div>

      {hasSelection ? (
        <aside className="prod-map-rail" aria-live="polite">
          <label className="prod-map-select">
            <span>Map item</span>
            <select
              value={
                effectiveSelection ? `${effectiveSelection.kind}:${effectiveSelection.id}` : ''
              }
              onChange={(event) => {
                const [kind, id] = event.target.value.split(':', 2);
                if (kind === 'record') {
                  const issue = issues.find((item) => item.publicId === id);
                  if (issue) focusIssue(issue);
                } else if (kind === 'alert') {
                  const alert = alerts.find((item) => item.id === id);
                  if (alert) focusAlert(alert);
                }
              }}
            >
              {issues.length ? (
                <optgroup label="Published records">
                  {issues.map((issue) => (
                    <option key={issue.publicId} value={`record:${issue.publicId}`}>
                      {issue.title ?? 'Public civic record'}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {alerts.length ? (
                <optgroup label="Official alerts">
                  {alerts.map((alert) => (
                    <option key={alert.id} value={`alert:${alert.id}`}>
                      {alert.title}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>

          {selectedIssue ? (
            <div className="prod-map-preview">
              <div className="prod-map-preview-media">
                {selectedIssue.mediaUrl ? (
                  <Image
                    src={selectedIssue.mediaUrl}
                    alt=""
                    fill
                    loading={compact ? 'lazy' : 'eager'}
                    sizes="(max-width: 900px) 100vw, 330px"
                  />
                ) : (
                  <span className="prod-record-media-empty" aria-hidden="true" />
                )}
                <span className={`prod-state prod-state-${state}`}>
                  {lifecycleLabel(selectedIssue)}
                </span>
              </div>
              <div className="prod-map-preview-copy">
                <span>
                  <MapPin size={15} weight="fill" aria-hidden="true" />
                  {ward?.label ?? 'Approximate area'}
                </span>
                <h3>{selectedIssue.title ?? 'Public civic record'}</h3>
                <p>
                  {selectedIssue.summary ??
                    'Open the record for its reviewed evidence and public history.'}
                </p>
                <dl>
                  <div>
                    <dt>Category</dt>
                    <dd>{categoryName(selectedIssue.category)}</dd>
                  </div>
                  <div>
                    <dt>Signals</dt>
                    <dd>{selectedIssue.signalCount}</dd>
                  </div>
                </dl>
                <Link href={`/issues/${selectedIssue.publicId}`}>
                  Open record <ArrowRight size={16} weight="bold" />
                </Link>
              </div>
            </div>
          ) : selectedAlert ? (
            <div className="prod-map-preview">
              <div className="prod-map-preview-media prod-map-alert-media">
                <Broadcast size={58} weight="duotone" aria-hidden="true" />
                <span className={`prod-state prod-state-${alertStateClass(selectedAlert.status)}`}>
                  {alertStatusLabel(selectedAlert.status)}
                </span>
              </div>
              <div className="prod-map-preview-copy">
                <span>
                  <MapPin size={15} weight="fill" aria-hidden="true" />
                  {selectedAlert.place}
                </span>
                <h3>{selectedAlert.title}</h3>
                <p>{selectedAlert.summary}</p>
                <dl>
                  <div>
                    <dt>Source</dt>
                    <dd>{selectedAlert.sourceLabel}</dd>
                  </div>
                  <div>
                    <dt>Published</dt>
                    <dd>{ageLabel(selectedAlert.minutesOld)}</dd>
                  </div>
                </dl>
                <a href={selectedAlert.sourceUrl} target="_blank" rel="noreferrer">
                  Open official source <ArrowSquareOut size={16} weight="bold" />
                </a>
              </div>
            </div>
          ) : null}
        </aside>
      ) : null}
    </section>
  );
}
