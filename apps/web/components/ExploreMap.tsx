'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowsOutSimple,
  CheckCircle,
  Clock,
  Crosshair,
  MapPin,
  Stack,
} from '@phosphor-icons/react';
import type { GeoJSONSource, MapGeoJSONFeature, MapMouseEvent } from 'maplibre-gl';
import { MapSurface, type MapSurfaceApi } from '@/components/maps/MapSurface';
import { categoryLabel } from '@/lib/constants/categories';
import { isClosedStatus, publicStatusLabel } from '@/lib/constants/statuses';
import { issueBounds, issuesToFeatureCollection, kathmanduCenter } from '@/lib/geo/map';
import { recordKindLabel } from '@/lib/issues/recordKind';
import type { CivicIssue } from '@/lib/types';

const sourceId = 'nagarik-civic-records';
const clusterLayerId = 'nagarik-clusters';
const pointLayerId = 'nagarik-points';
const selectedLayerId = 'nagarik-selected-point';

function observedDays(issue: CivicIssue) {
  return Math.max(0, Math.floor((Date.now() - new Date(issue.firstObservedAt).getTime()) / 86_400_000));
}

function movementDuration(api: MapSurfaceApi, duration = 850) {
  return api.reducedMotion ? 0 : duration;
}

function addAtlasLayers(api: MapSurfaceApi, issues: CivicIssue[], selectedId: string) {
  const { map } = api;
  map.addSource(sourceId, {
    type: 'geojson',
    data: issuesToFeatureCollection(issues),
    cluster: true,
    clusterMaxZoom: 12,
    clusterRadius: 54,
  });
  map.addLayer({
    id: 'nagarik-cluster-halo',
    type: 'circle',
    source: sourceId,
    filter: ['has', 'point_count'],
    paint: {
      'circle-radius': ['step', ['get', 'point_count'], 23, 8, 28, 20, 34],
      'circle-color': 'rgba(22, 30, 28, 0.16)',
      'circle-blur': 0.45,
    },
  });
  map.addLayer({
    id: clusterLayerId,
    type: 'circle',
    source: sourceId,
    filter: ['has', 'point_count'],
    paint: {
      'circle-radius': ['step', ['get', 'point_count'], 17, 8, 21, 20, 26],
      'circle-color': '#18211f',
      'circle-stroke-color': '#fffefc',
      'circle-stroke-width': 2,
      'circle-opacity': 0.94,
    },
  });
  map.addLayer({
    id: 'nagarik-cluster-count',
    type: 'symbol',
    source: sourceId,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
    },
    paint: { 'text-color': '#fffefc' },
  });
  map.addLayer({
    id: 'nagarik-point-halo',
    type: 'circle',
    source: sourceId,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 12, 14, 17],
      'circle-color': 'rgba(22, 30, 28, 0.14)',
      'circle-blur': 0.4,
    },
  });
  map.addLayer({
    id: pointLayerId,
    type: 'circle',
    source: sourceId,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 7, 14, 10],
      'circle-color': [
        'match', ['get', 'status'],
        'resolved', '#3f7565',
        'in_progress', '#c1842f',
        'verified', '#2e6759',
        'disputed', '#78675b',
        'rejected', '#77736e',
        '#b52f3d',
      ],
      'circle-stroke-color': [
        'case',
        ['==', ['get', 'recordKind'], 'illustrative_sample'], '#f5c465',
        '#fffefc',
      ],
      'circle-stroke-width': [
        'case',
        ['==', ['get', 'recordKind'], 'illustrative_sample'], 3,
        2,
      ],
      'circle-opacity': 0.96,
    },
  });
  map.addLayer({
    id: selectedLayerId,
    type: 'circle',
    source: sourceId,
    filter: ['==', ['get', 'id'], selectedId],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 14, 14, 19],
      'circle-color': 'rgba(0, 0, 0, 0)',
      'circle-stroke-color': '#b52f3d',
      'circle-stroke-width': 3,
      'circle-opacity': 1,
    },
  });
}

export function ExploreMap({ issues, compact = false }: { issues: CivicIssue[]; compact?: boolean }) {
  const [selectedId, setSelectedId] = useState(issues[0]?.id ?? '');
  const apiRef = useRef<MapSurfaceApi | null>(null);
  const data = useMemo(() => issuesToFeatureCollection(issues), [issues]);
  const selected = issues.find((issue) => issue.id === selectedId) ?? issues[0];
  const unresolved = issues.filter((issue) => !isClosedStatus(issue.status)).length;
  const anchored = issues.filter((issue) => issue.proof.proofStatus === 'indexed_devnet' || issue.proof.proofStatus === 'verified_devnet').length;
  const areas = new Set(issues.map((issue) => issue.wardId)).size;

  useEffect(() => {
    const source = apiRef.current?.map.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(data);
  }, [data]);

  useEffect(() => {
    const map = apiRef.current?.map;
    if (map?.getLayer(selectedLayerId)) {
      map.setFilter(selectedLayerId, ['==', ['get', 'id'], selected?.id ?? '']);
    }
  }, [selected?.id]);

  function fitAll() {
    const api = apiRef.current;
    const bounds = issueBounds(issues);
    if (!api || !bounds) return;
    api.map.fitBounds(bounds, {
      padding: window.innerWidth < 720 ? 56 : { top: 84, right: 78, bottom: 74, left: 78 },
      maxZoom: 14,
      duration: movementDuration(api, 1000),
    });
  }

  function focusIssue(issue: CivicIssue) {
    const api = apiRef.current;
    setSelectedId(issue.id);
    if (!api) return;
    api.map.easeTo({
      center: [issue.lngDisplay, issue.latDisplay],
      zoom: Math.max(api.map.getZoom(), 13.2),
      duration: movementDuration(api),
    });
  }

  function handleMapReady(api: MapSurfaceApi | null) {
    apiRef.current = api;
    if (!api) return;
    addAtlasLayers(api, issues, selected?.id ?? '');

    const map = api.map;
    const pointClick = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const id = String(event.features?.[0]?.properties?.id ?? '');
      const issue = issues.find((item) => item.id === id);
      if (issue) focusIssue(issue);
    };
    const clusterClick = async (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== 'Point') return;
      const clusterId = Number(feature.properties?.cluster_id);
      const source = map.getSource(sourceId) as GeoJSONSource;
      const zoom = await source.getClusterExpansionZoom(clusterId);
      map.easeTo({
        center: feature.geometry.coordinates as [number, number],
        zoom,
        duration: movementDuration(api, 700),
      });
    };
    const pointer = () => { map.getCanvas().style.cursor = 'pointer'; };
    const unpointer = () => { map.getCanvas().style.cursor = ''; };

    map.on('click', pointLayerId, pointClick);
    map.on('click', clusterLayerId, clusterClick);
    map.on('mouseenter', pointLayerId, pointer);
    map.on('mouseleave', pointLayerId, unpointer);
    map.on('mouseenter', clusterLayerId, pointer);
    map.on('mouseleave', clusterLayerId, unpointer);
    window.requestAnimationFrame(fitAll);
  }

  if (!issues.length) return null;

  return (
    <section className={`civic-atlas ${compact ? 'civic-atlas-compact' : ''}`} aria-labelledby="civic-atlas-title">
      {compact ? <h2 id="civic-atlas-title" className="sr-only">Public issues and follow-up</h2> : (
        <header className="atlas-header">
          <div>
            <span className="eyebrow"><Crosshair size={15} weight="bold" />Live map</span>
            <h2 id="civic-atlas-title">Public issues and follow-up</h2>
          </div>
          <dl className="atlas-metrics" aria-label="Map summary">
            <div><dt>Visible</dt><dd>{issues.length}</dd></div>
            <div><dt>Open</dt><dd>{unresolved}</dd></div>
            <div><dt>Areas</dt><dd>{areas}</dd></div>
            <div><dt>On-chain</dt><dd>{anchored}</dd></div>
          </dl>
        </header>
      )}

      <div className="atlas-workspace">
        <div className="atlas-map-column">
          <MapSurface
            ariaLabel={`Interactive map of ${issues.length} approximate civic record locations`}
            className="atlas-map"
            initialCenter={kathmanduCenter}
            initialZoom={7}
            minZoom={5}
            deferUntilVisible={compact}
            onMapReady={handleMapReady}
          >
            <div className="atlas-map-key" aria-hidden="true">
              <span><i className="status-submitted" />Open</span>
              <span><i className="status-progress" />In progress</span>
              <span><i className="status-resolved" />Resolved</span>
            </div>
            <button className="map-tool-button atlas-fit-button" type="button" onClick={fitAll} aria-label="Fit all records on map" title="Fit all records">
              <ArrowsOutSimple size={18} weight="bold" />
            </button>
          </MapSurface>
        </div>

        <aside className="atlas-rail" aria-label="Mapped civic records">
          <label className="atlas-mobile-record-select">
            <span>Choose a record</span>
            <select
              value={selected?.id ?? ''}
              onChange={(event) => {
                const issue = issues.find((item) => item.id === event.target.value);
                if (issue) focusIssue(issue);
              }}
            >
              {issues.map((issue) => <option key={issue.id} value={issue.id}>{issue.title}</option>)}
            </select>
          </label>
          {selected ? (
            <div className="atlas-selection" aria-live="polite">
              <div className="atlas-selection-media">
                <Image src={selected.photoUrl} alt="" fill sizes="(max-width: 900px) 100vw, 320px" />
                <span className={`pill status-${selected.status}`}>{publicStatusLabel(selected.status)}</span>
              </div>
              <div className="atlas-selection-copy">
                <span className="atlas-location"><MapPin size={15} weight="fill" />{selected.locality}</span>
                <h3>{selected.title}</h3>
                <div className="atlas-selection-facts">
                  <span><Stack size={15} weight="bold" />{categoryLabel(selected.category)}</span>
                  <span><CheckCircle size={15} weight="bold" />{selected.verificationCount} signal{selected.verificationCount === 1 ? '' : 's'}</span>
                  <span><Clock size={15} weight="bold" />{isClosedStatus(selected.status) ? 'Closed record' : `${observedDays(selected)} days observed`}</span>
                </div>
                <Link className="atlas-open-record" href={`/issues/${selected.id}`}>View public record <ArrowRight size={17} weight="bold" /></Link>
                {compact ? <Link className="atlas-explore-all" href="/explore">Explore all issues</Link> : null}
              </div>
            </div>
          ) : null}

          {!compact ? <div className="atlas-record-index">
            <div className="atlas-record-index-head">
              <span>Visible records</span>
              <span className="mono">{String(issues.length).padStart(2, '0')}</span>
            </div>
            <div className="atlas-record-list">
              {issues.map((issue, index) => (
                <button
                  key={issue.id}
                  type="button"
                  className={issue.id === selected?.id ? 'active' : ''}
                  onClick={() => focusIssue(issue)}
                  aria-pressed={issue.id === selected?.id}
                >
                  <span className={`atlas-record-status status-${issue.status}`} aria-hidden="true" />
                  <span className="mono atlas-record-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="atlas-record-title"><strong>{issue.title}</strong><small>{recordKindLabel(issue)} / {issue.locality}</small></span>
                  <ArrowRight size={15} weight="bold" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div> : null}
        </aside>
      </div>

      {!compact ? <footer className="atlas-footer">
        <span>Locations are rounded before publication.</span>
        <span>Markers show an area, not a reporter.</span>
      </footer> : null}
    </section>
  );
}
