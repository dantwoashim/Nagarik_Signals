'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowClockwise, MapTrifold, WarningCircle } from '@phosphor-icons/react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { detailedMapStyleUrl, nepalMapInteractionBounds } from '@/lib/geo/map';

export type MapSurfaceApi = {
  map: MapLibreMap;
  reducedMotion: boolean;
};

type MapSurfaceProps = {
  active?: boolean;
  ariaLabel: string;
  children?: ReactNode;
  className?: string;
  controls?: boolean;
  deferUntilVisible?: boolean;
  initialCenter: [number, number];
  initialZoom: number;
  maxZoom?: number;
  minZoom?: number;
  onMapReady?: (api: MapSurfaceApi | null) => void;
  onMoveEnd?: (api: MapSurfaceApi) => void;
  onMoveStart?: (api: MapSurfaceApi) => void;
  styleUrl?: string;
};

export function MapSurface({
  active = true,
  ariaLabel,
  children,
  className = '',
  controls = true,
  deferUntilVisible = false,
  initialCenter,
  initialZoom,
  maxZoom = 18,
  minZoom = 5,
  onMapReady,
  onMoveEnd,
  onMoveStart,
  styleUrl = detailedMapStyleUrl,
}: MapSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const initialCenterRef = useRef(initialCenter);
  const onMapReadyRef = useRef(onMapReady);
  const onMoveEndRef = useRef(onMoveEnd);
  const onMoveStartRef = useRef(onMoveStart);
  const [visible, setVisible] = useState(!deferUntilVisible);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onMapReadyRef.current = onMapReady;
    onMoveEndRef.current = onMoveEnd;
    onMoveStartRef.current = onMoveStart;
    initialCenterRef.current = initialCenter;
  }, [initialCenter, onMapReady, onMoveEnd, onMoveStart]);

  useEffect(() => {
    if (!deferUntilVisible || visible || !hostRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '240px' });
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, [deferUntilVisible, visible]);

  useEffect(() => {
    if (!active || !visible || !hostRef.current) {
      setState('idle');
      return;
    }

    let disposed = false;
    let loadTimer = 0;
    let resizeObserver: ResizeObserver | null = null;
    setState('loading');

    async function mountMap() {
      try {
        const maplibreModule = await import('maplibre-gl');
        const library = maplibreModule.default;
        if (disposed || !hostRef.current) return;

        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const map = new library.Map({
          container: hostRef.current,
          style: styleUrl,
          center: initialCenterRef.current,
          zoom: initialZoom,
          minZoom,
          maxZoom,
          maxBounds: nepalMapInteractionBounds,
          attributionControl: false,
          cooperativeGestures: true,
          fadeDuration: reducedMotion ? 0 : 180,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          pitchWithRotate: false,
          refreshExpiredTiles: true,
        });
        mapRef.current = map;
        map.dragRotate.disable();
        map.touchZoomRotate.disableRotation();

        if (controls) {
          map.addControl(new library.NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');
          map.addControl(new library.FullscreenControl({ container: hostRef.current.parentElement ?? hostRef.current }), 'top-right');
          map.addControl(new library.ScaleControl({ maxWidth: 96, unit: 'metric' }), 'bottom-left');
        }

        const api: MapSurfaceApi = { map, reducedMotion };
        const moveStart = () => onMoveStartRef.current?.(api);
        const moveEnd = () => onMoveEndRef.current?.(api);
        map.on('movestart', moveStart);
        map.on('moveend', moveEnd);
        map.once('load', () => {
          if (disposed) return;
          window.clearTimeout(loadTimer);
          setState('ready');
          onMapReadyRef.current?.(api);
        });

        loadTimer = window.setTimeout(() => {
          if (!map.loaded() && !disposed) setState('error');
        }, 5_000);

        resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(hostRef.current);
      } catch {
        if (!disposed) setState('error');
      }
    }

    void mountMap();

    return () => {
      disposed = true;
      window.clearTimeout(loadTimer);
      resizeObserver?.disconnect();
      onMapReadyRef.current?.(null);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [active, attempt, controls, initialZoom, maxZoom, minZoom, styleUrl, visible]);

  return (
    <div className={`map-surface ${className}`} data-map-state={state} role="region" aria-label={ariaLabel} aria-busy={state === 'loading'}>
      <div ref={hostRef} className="map-surface-host" />
      {state === 'loading' ? (
        <div className="map-surface-state map-loading" role="status">
          <MapTrifold size={22} weight="duotone" aria-hidden="true" />
          <span>Loading street detail</span>
          <i /><i /><i />
        </div>
      ) : null}
      {state === 'error' ? (
        <div className="map-surface-state map-error" role="status">
          <WarningCircle size={23} weight="duotone" aria-hidden="true" />
          <strong>Detailed map unavailable</strong>
          <span>Location labels and record links remain available.</span>
          <button type="button" className="button secondary" onClick={() => setAttempt((value) => value + 1)}>
            <ArrowClockwise size={16} weight="bold" /> Retry map
          </button>
        </div>
      ) : null}
      {children}
      <div className="map-attribution">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
        <span aria-hidden="true">/</span>
        <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>
      </div>
    </div>
  );
}
