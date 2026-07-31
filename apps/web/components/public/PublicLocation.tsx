'use client';

import { MapPin, ShieldCheck } from '@phosphor-icons/react';

import { MapSurface, type MapSurfaceApi } from '@/components/maps/MapSurface';
import { publicLocationCircle } from '@/lib/geo/map';
import { publicPoint, publicRadius, publicWard } from '@/lib/public/contracts';

const sourceId = 'nagarik-issue-v2-area';

export function PublicLocation({ location, ward }: { location: unknown; ward: unknown }) {
  const point = publicPoint(location);
  const radius = publicRadius(location);
  const area = publicWard(ward);
  if (!point) {
    return (
      <section className="prod-issue-section" aria-labelledby="location-heading">
        <header>
          <span className="eyebrow">
            <MapPin size={14} weight="fill" /> Location
          </span>
          <h2 id="location-heading">{area.label}</h2>
        </header>
        <p className="muted">A public map point is unavailable for this record.</p>
      </section>
    );
  }
  const publicCenter = point;

  function ready(api: MapSurfaceApi | null) {
    if (!api) return;
    const { map } = api;
    map.addSource(sourceId, {
      type: 'geojson',
      data: publicLocationCircle(publicCenter.latitude, publicCenter.longitude, radius),
    });
    map.addLayer({
      id: `${sourceId}-fill`,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': '#ad2d39',
        'fill-opacity': 0.13,
      },
    });
    map.addLayer({
      id: `${sourceId}-line`,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#ad2d39',
        'line-width': 2,
      },
    });
  }

  return (
    <section className="prod-issue-section prod-public-location" aria-labelledby="location-heading">
      <header className="prod-section-heading">
        <div>
          <span className="eyebrow">
            <MapPin size={14} weight="fill" /> Approximate location
          </span>
          <h2 id="location-heading">{area.label}</h2>
        </div>
        <span className="prod-location-radius">
          <ShieldCheck size={15} weight="bold" /> About {radius.toLocaleString()} m
        </span>
      </header>
      <MapSurface
        ariaLabel={`Approximate public location for ${area.label}`}
        className="prod-issue-map"
        initialCenter={[point.longitude, point.latitude]}
        initialZoom={12.5}
        minZoom={7}
        onMapReady={ready}
      />
      <p>
        The marked area communicates location uncertainty. It does not identify the reporter or an
        exact property.
      </p>
    </section>
  );
}
