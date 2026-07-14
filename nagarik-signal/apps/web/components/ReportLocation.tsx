'use client';

import { useMemo, useRef, useState } from 'react';
import { Crosshair, MapPin, NavigationArrow, ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import { MapSurface, type MapSurfaceApi } from '@/components/maps/MapSurface';
import { getWard, wards } from '@/lib/geo/wards';
import { isInsideNepalMapBounds, roundPublicCoordinate } from '@/lib/geo/map';

function localDateTimeValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

type ReportLocationProps = {
  active: boolean;
};

export function ReportLocation({ active }: ReportLocationProps) {
  const [wardId, setWardId] = useState(wards[0].id);
  const selectedWard = useMemo(() => getWard(wardId), [wardId]);
  const [lat, setLat] = useState(selectedWard.lat.toFixed(3));
  const [lng, setLng] = useState(selectedWard.lng.toFixed(3));
  const [moving, setMoving] = useState(false);
  const [locationState, setLocationState] = useState<'idle' | 'locating' | 'ready' | 'error'>('idle');
  const [locationMessage, setLocationMessage] = useState('Only the rounded point below enters the public record.');
  const apiRef = useRef<MapSurfaceApi | null>(null);

  function moveMap(nextLat: number, nextLng: number, animate = true) {
    const roundedLat = roundPublicCoordinate(nextLat);
    const roundedLng = roundPublicCoordinate(nextLng);
    setLat(roundedLat.toFixed(3));
    setLng(roundedLng.toFixed(3));
    const api = apiRef.current;
    if (!api) return;
    api.map.easeTo({
      center: [roundedLng, roundedLat],
      zoom: Math.max(api.map.getZoom(), 14.2),
      duration: !animate || api.reducedMotion ? 0 : 800,
    });
  }

  function selectWard(nextWardId: string) {
    const ward = getWard(nextWardId);
    setWardId(ward.id);
    setLocationState('idle');
    setLocationMessage(`Centered on ${ward.locality}. Move the map to adjust the public point.`);
    moveMap(ward.lat, ward.lng);
  }

  function useCurrentArea() {
    if (!navigator.geolocation) {
      setLocationState('error');
      setLocationMessage('This browser does not provide location access. Use the map or coordinate fields instead.');
      return;
    }
    setLocationState('locating');
    setLocationMessage('Requesting a one-time location fix...');
    navigator.geolocation.getCurrentPosition((position) => {
      const roundedLat = roundPublicCoordinate(position.coords.latitude);
      const roundedLng = roundPublicCoordinate(position.coords.longitude);
      if (!isInsideNepalMapBounds(roundedLat, roundedLng)) {
        setLocationState('error');
        setLocationMessage('The returned point is outside the supported Nepal map area. Choose an area manually.');
        return;
      }
      moveMap(roundedLat, roundedLng);
      setLocationState('ready');
      setLocationMessage('Location rounded immediately to three decimals. Exact device coordinates were not retained.');
    }, () => {
      setLocationState('error');
      setLocationMessage('Location permission was unavailable. Choose the nearest ward and move the map instead.');
    }, {
      enableHighAccuracy: false,
      maximumAge: 300_000,
      timeout: 8_000,
    });
  }

  function applyManualPoint() {
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng) || !isInsideNepalMapBounds(nextLat, nextLng)) {
      setLocationState('error');
      setLocationMessage('Enter a point inside Nepal using valid decimal coordinates.');
      return;
    }
    moveMap(nextLat, nextLng);
    setLocationState('ready');
    setLocationMessage('Manual point applied and rounded for publication.');
  }

  return (
    <div className="report-location-workspace">
      <div className="location-picker-shell">
        <MapSurface
          active={active}
          ariaLabel="Interactive picker for an approximate public issue location"
          className="location-picker-map"
          initialCenter={[Number(lng), Number(lat)]}
          initialZoom={14.2}
          minZoom={7}
          onMapReady={(api) => { apiRef.current = api; }}
          onMoveStart={() => setMoving(true)}
          onMoveEnd={(api) => {
            const center = api.map.getCenter();
            const roundedLat = roundPublicCoordinate(center.lat);
            const roundedLng = roundPublicCoordinate(center.lng);
            if (isInsideNepalMapBounds(roundedLat, roundedLng)) {
              setLat(roundedLat.toFixed(3));
              setLng(roundedLng.toFixed(3));
            }
            setMoving(false);
          }}
        >
          <div className={`location-picker-target ${moving ? 'moving' : ''}`} aria-hidden="true">
            <span className="location-picker-halo" />
            <MapPin size={32} weight="fill" />
          </div>
          <div className="location-picker-badge"><ShieldCheck size={14} weight="bold" />Rounded public point</div>
        </MapSurface>
        <div className="location-coordinate-strip">
          <span><i aria-hidden="true" />Public coordinate</span>
          <code className="mono">{lat}, {lng}</code>
          <span>~100 m precision</span>
        </div>
      </div>

      <aside className="location-control-panel">
        <div className="location-control-heading">
          <span className="eyebrow"><Crosshair size={14} weight="bold" />Public geography</span>
          <h3>{selectedWard.label}</h3>
          <p>{selectedWard.locality}. The area label stays primary; coordinates remain deliberately coarse.</p>
        </div>

        <label className="field">
          <span>Ward / locality</span>
          <select name="wardId" value={wardId} onChange={(event) => selectWard(event.target.value)} required>
            {wards.map((ward) => (
              <option key={ward.id} value={ward.id}>{ward.label} / {ward.locality}</option>
            ))}
          </select>
        </label>

        <button className="button secondary location-use-button" type="button" onClick={useCurrentArea} disabled={locationState === 'locating'}>
          {locationState === 'error' ? <WarningCircle size={17} weight="bold" /> : <NavigationArrow size={17} weight="bold" />}
          {locationState === 'locating' ? 'Locating once...' : 'Use my current area'}
        </button>
        <p className={`location-state ${locationState}`} role={locationState === 'error' ? 'alert' : 'status'} aria-live="polite">{locationMessage}</p>

        <label className="field">
          <span>First observed</span>
          <input name="firstObservedAt" type="datetime-local" defaultValue={localDateTimeValue()} required />
          <span className="helper">Use the first time you personally observed the infrastructure issue.</span>
        </label>

        <details className="advanced-location">
          <summary><Crosshair size={17} weight="bold" />Coordinate fallback</summary>
          <div className="advanced-location-fields">
            <label className="field">
              <span>Approx latitude</span>
              <input name="latDisplay" type="number" step="0.001" min="25.8" max="31.1" value={lat} onChange={(event) => setLat(event.target.value)} required />
            </label>
            <label className="field">
              <span>Approx longitude</span>
              <input name="lngDisplay" type="number" step="0.001" min="79.6" max="89.2" value={lng} onChange={(event) => setLng(event.target.value)} required />
            </label>
            <button className="button secondary" type="button" onClick={applyManualPoint}>Apply coordinates</button>
          </div>
        </details>
      </aside>
    </div>
  );
}
