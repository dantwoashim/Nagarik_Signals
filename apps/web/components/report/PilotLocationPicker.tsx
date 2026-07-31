'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  MapPin,
  NavigationArrow,
  ShieldCheck,
  WarningCircle,
} from '@phosphor-icons/react';

import { MapSurface, type MapSurfaceApi } from '@/components/maps/MapSurface';
import { isInsideNepalMapBounds } from '@/lib/geo/map';
import { wards } from '@/lib/geo/wards';

type PilotLocationPickerProps = {
  active: boolean;
  wardGeometryVersion: string;
  wardIds: string[];
};

function wardLabel(id: string) {
  const known = wards.find((ward) => ward.id === id);
  return known ? `${known.label} / ${known.locality}` : id;
}

function initialPoint(wardId: string) {
  const known = wards.find((ward) => ward.id === wardId);
  return {
    latitude: known?.lat ?? 27.708,
    longitude: known?.lng ?? 85.324,
  };
}

export function PilotLocationPicker({
  active,
  wardGeometryVersion,
  wardIds,
}: PilotLocationPickerProps) {
  const availableWards = wardIds.length ? wardIds : wards.map((ward) => ward.id);
  const [wardId, setWardId] = useState(availableWards[0]);
  const start = useMemo(() => initialPoint(wardId), [wardId]);
  const [latitude, setLatitude] = useState(start.latitude);
  const [longitude, setLongitude] = useState(start.longitude);
  const [moving, setMoving] = useState(false);
  const [message, setMessage] = useState(
    'Move the map to the issue. The public record uses a much wider approximate area.',
  );
  const [locationState, setLocationState] = useState<'idle' | 'locating' | 'ready' | 'error'>(
    'idle',
  );
  const apiRef = useRef<MapSurfaceApi | null>(null);

  function move(nextLatitude: number, nextLongitude: number) {
    setLatitude(nextLatitude);
    setLongitude(nextLongitude);
    apiRef.current?.map.easeTo({
      center: [nextLongitude, nextLatitude],
      zoom: Math.max(apiRef.current.map.getZoom(), 14),
      duration: apiRef.current.reducedMotion ? 0 : 600,
    });
  }

  function changeWard(nextWardId: string) {
    setWardId(nextWardId);
    const next = initialPoint(nextWardId);
    move(next.latitude, next.longitude);
    setLocationState('idle');
    setMessage('Move the map to the issue within the selected ward.');
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationState('error');
      setMessage('Location access is unavailable. Choose the point on the map.');
      return;
    }
    setLocationState('locating');
    setMessage('Requesting one location fix...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLatitude = position.coords.latitude;
        const nextLongitude = position.coords.longitude;
        if (!isInsideNepalMapBounds(nextLatitude, nextLongitude)) {
          setLocationState('error');
          setMessage('The returned point is outside the supported Nepal map area.');
          return;
        }
        move(nextLatitude, nextLongitude);
        setLocationState('ready');
        setMessage('Private review point selected. Publication uses a coarse area.');
      },
      () => {
        setLocationState('error');
        setMessage('Location permission was unavailable. Choose the point on the map.');
      },
      {
        enableHighAccuracy: false,
        maximumAge: 300_000,
        timeout: 8_000,
      },
    );
  }

  return (
    <div className="prod-location-picker">
      <div className="prod-location-map">
        <MapSurface
          active={active}
          ariaLabel="Map picker for the privately reviewed issue location"
          className="prod-location-map-surface"
          initialCenter={[start.longitude, start.latitude]}
          initialZoom={14}
          minZoom={7}
          onMapReady={(api) => {
            apiRef.current = api;
          }}
          onMoveStart={() => setMoving(true)}
          onMoveEnd={(api) => {
            const center = api.map.getCenter();
            if (isInsideNepalMapBounds(center.lat, center.lng)) {
              setLatitude(center.lat);
              setLongitude(center.lng);
              setLocationState('ready');
              setMessage('Private review point selected. Publication uses a coarse area.');
            } else {
              api.map.easeTo({
                center: [longitude, latitude],
                duration: api.reducedMotion ? 0 : 250,
              });
              setLocationState('error');
              setMessage('Choose a point inside Nepal.');
            }
            setMoving(false);
          }}
        >
          <div className={`prod-location-target ${moving ? 'moving' : ''}`} aria-hidden="true">
            <span />
            <MapPin size={32} weight="fill" />
          </div>
          <div className="prod-location-private">
            <ShieldCheck size={14} weight="bold" />
            Private review point
          </div>
        </MapSurface>
      </div>

      <div className="prod-location-controls">
        <label className="field">
          <span>Ward</span>
          <select
            name="wardId"
            value={wardId}
            onChange={(event) => changeWard(event.target.value)}
            required
          >
            {availableWards.map((id) => (
              <option key={id} value={id}>
                {wardLabel(id)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Nearby public place</span>
          <input
            name="localityLabel"
            type="text"
            maxLength={80}
            placeholder="Example: beside the ward office"
          />
        </label>
        <input type="hidden" name="geometryVersion" value={wardGeometryVersion} />
        <input type="hidden" name="latitudeE6" value={Math.round(latitude * 1_000_000)} />
        <input type="hidden" name="longitudeE6" value={Math.round(longitude * 1_000_000)} />
        <button
          className="button secondary"
          type="button"
          onClick={useCurrentLocation}
          disabled={locationState === 'locating'}
        >
          {locationState === 'error' ? (
            <WarningCircle size={17} weight="bold" />
          ) : (
            <NavigationArrow size={17} weight="bold" />
          )}
          {locationState === 'locating' ? 'Locating...' : 'Use my current location'}
        </button>
        <p
          className={`prod-location-message ${locationState}`}
          role={locationState === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
        <details className="prod-location-details">
          <summary>
            <Crosshair size={16} weight="bold" /> Review selected coordinates
          </summary>
          <div>
            <label className="field">
              <span>Latitude</span>
              <input
                type="number"
                min="25.8"
                max="31.1"
                step="0.000001"
                value={latitude}
                onChange={(event) => setLatitude(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Longitude</span>
              <input
                type="number"
                min="79.6"
                max="89.2"
                step="0.000001"
                value={longitude}
                onChange={(event) => setLongitude(Number(event.target.value))}
              />
            </label>
            <button
              className="button secondary"
              type="button"
              onClick={() => move(latitude, longitude)}
            >
              Apply
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
