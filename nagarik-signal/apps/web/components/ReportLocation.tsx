'use client';

import { useMemo, useState } from 'react';
import { Crosshair, MapPin, ShieldCheck } from '@phosphor-icons/react';
import { getWard, wards } from '@/lib/geo/wards';

function localDateTimeValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function ReportLocation() {
  const [wardId, setWardId] = useState(wards[0].id);
  const initialWard = useMemo(() => getWard(wardId), [wardId]);
  const [lat, setLat] = useState(initialWard.lat.toFixed(3));
  const [lng, setLng] = useState(initialWard.lng.toFixed(3));

  function selectWard(nextWardId: string) {
    const ward = getWard(nextWardId);
    setWardId(ward.id);
    setLat(ward.lat.toFixed(3));
    setLng(ward.lng.toFixed(3));
  }

  return (
    <div className="report-location-grid">
      <div className="form-grid">
        <label className="field">
          <span>Ward / locality</span>
          <select name="wardId" value={wardId} onChange={(event) => selectWard(event.target.value)} required>
            {wards.map((ward) => (
              <option key={ward.id} value={ward.id}>{ward.label}</option>
            ))}
          </select>
          <span className="helper">Choose the nearest public area. The visible record leads with this locality, not exact GPS.</span>
        </label>

        <label className="field">
          <span>First observed</span>
          <input name="firstObservedAt" type="datetime-local" defaultValue={localDateTimeValue()} required />
          <span className="helper">Use the first time you personally observed the infrastructure issue.</span>
        </label>

        <details className="advanced-location">
          <summary><Crosshair size={17} weight="bold" />Adjust the approximate map point</summary>
          <div className="grid-auto advanced-location-fields">
            <label className="field">
              <span>Approx latitude</span>
              <input
                name="latDisplay"
                type="number"
                step="0.001"
                min="26"
                max="31"
                value={lat}
                onChange={(event) => setLat(event.target.value)}
                required
                aria-describedby="approx-location-note"
              />
            </label>
            <label className="field">
              <span>Approx longitude</span>
              <input
                name="lngDisplay"
                type="number"
                step="0.001"
                min="80"
                max="89"
                value={lng}
                onChange={(event) => setLng(event.target.value)}
                required
                aria-describedby="approx-location-note"
              />
            </label>
            <span id="approx-location-note" className="helper location-helper">
              Coordinates are rounded to three decimals before publication. Never place this point on a private home.
            </span>
          </div>
        </details>
      </div>

      <aside className="location-preview" aria-label={`Approximate location preview for ${initialWard.label}`}>
        <div className="location-preview-map" aria-hidden="true">
          <span className="location-preview-ring" />
          <MapPin size={26} weight="fill" />
        </div>
        <div className="location-preview-copy">
          <span className="eyebrow"><ShieldCheck size={14} weight="bold" />Approximate by design</span>
          <strong>{initialWard.label}</strong>
          <span>{initialWard.locality}</span>
          <code className="mono">{lat || '---'}, {lng || '---'}</code>
        </div>
      </aside>
    </div>
  );
}
