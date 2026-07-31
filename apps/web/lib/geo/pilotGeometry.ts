import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { z } from 'zod';

const coordinate = z.tuple([z.number().finite(), z.number().finite()]);
const ring = z.array(coordinate).min(4);
const polygonCoordinates = z.array(ring).min(1);
const multiPolygonCoordinates = z.array(polygonCoordinates).min(1);
const geometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: polygonCoordinates }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: multiPolygonCoordinates }),
]);
const feature = z.object({
  type: z.literal('Feature'),
  properties: z.object({
    kind: z.enum(['pilot', 'ward']),
    wardId: z.string().min(1).optional(),
  }),
  geometry,
});
const featureCollection = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(feature).min(2),
});

export type PilotGeometryPolicy = {
  boundaryVersion: string;
  wardGeometryVersion: string;
  geometry: FeatureCollection<Polygon | MultiPolygon, { kind: 'pilot' | 'ward'; wardId?: string }>;
};

export class LocationPolicyError extends Error {
  constructor(
    public readonly code:
      | 'outside_nepal'
      | 'outside_pilot_scope'
      | 'ward_unknown'
      | 'ward_location_mismatch'
      | 'geometry_version_mismatch',
  ) {
    super(code);
    this.name = 'LocationPolicyError';
  }
}

export function roundE6ToE3(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('coordinate_must_be_integer_e6');
  if (value === 0) return 0;
  return Math.sign(value) * Math.floor((Math.abs(value) + 500) / 1_000);
}

function polygonFeature(
  item: z.infer<typeof feature>,
): Feature<Polygon | MultiPolygon, { kind: 'pilot' | 'ward'; wardId?: string }> {
  return item as Feature<Polygon | MultiPolygon, { kind: 'pilot' | 'ward'; wardId?: string }>;
}

export function parsePilotGeometryPolicy(input: {
  boundaryVersion: string;
  wardGeometryVersion: string;
  boundaryGeojson: unknown;
}): PilotGeometryPolicy {
  const parsed = featureCollection.parse(input.boundaryGeojson);
  const pilotFeatures = parsed.features.filter((item) => item.properties.kind === 'pilot');
  const wardFeatures = parsed.features.filter((item) => item.properties.kind === 'ward');
  if (
    pilotFeatures.length !== 1 ||
    wardFeatures.length < 1 ||
    wardFeatures.some((item) => !item.properties.wardId) ||
    new Set(wardFeatures.map((item) => item.properties.wardId)).size !== wardFeatures.length
  ) {
    throw new Error('pilot_geometry_policy_invalid');
  }
  return {
    boundaryVersion: input.boundaryVersion,
    wardGeometryVersion: input.wardGeometryVersion,
    geometry: {
      type: 'FeatureCollection',
      features: parsed.features.map(polygonFeature),
    },
  };
}

function contains(
  featureValue: Feature<Polygon | MultiPolygon>,
  latitudeE3: number,
  longitudeE3: number,
): boolean {
  return booleanPointInPolygon(point([longitudeE3 / 1_000, latitudeE3 / 1_000]), featureValue, {
    ignoreBoundary: false,
  });
}

export function validatePrivateLocation(input: {
  latitudeE6: number;
  longitudeE6: number;
  wardId: string;
  geometryVersion: string;
  intakePolicyVersion: string;
  policy: PilotGeometryPolicy;
}): {
  latitudeE3: number;
  longitudeE3: number;
  publicLocation: {
    policyVersion: 'grid-0.01deg-v1';
    wardId: string;
    wardGeometryVersion: string;
    latIndex: number;
    lngIndex: number;
    coarseCellId: string;
    centerLatE6: number;
    centerLngE6: number;
    uncertaintyRadiusM: 800;
  };
} {
  if (
    input.geometryVersion !== input.policy.wardGeometryVersion ||
    input.intakePolicyVersion !== input.policy.boundaryVersion
  ) {
    throw new LocationPolicyError('geometry_version_mismatch');
  }
  const latitudeE3 = roundE6ToE3(input.latitudeE6);
  const longitudeE3 = roundE6ToE3(input.longitudeE6);
  if (
    latitudeE3 < -90_000 ||
    latitudeE3 > 90_000 ||
    longitudeE3 < -180_000 ||
    longitudeE3 > 180_000
  ) {
    throw new LocationPolicyError('outside_nepal');
  }

  const pilot = input.policy.geometry.features.find((item) => item.properties.kind === 'pilot')!;
  if (!contains(pilot, latitudeE3, longitudeE3)) {
    throw new LocationPolicyError('outside_pilot_scope');
  }

  const ward = input.policy.geometry.features.find(
    (item) => item.properties.kind === 'ward' && item.properties.wardId === input.wardId,
  );
  if (!ward) throw new LocationPolicyError('ward_unknown');
  if (!contains(ward, latitudeE3, longitudeE3)) {
    throw new LocationPolicyError('ward_location_mismatch');
  }

  const latIndex = Math.floor((latitudeE3 + 90_000) / 10);
  const lngIndex = Math.floor((longitudeE3 + 180_000) / 10);
  if (latIndex > 17_999 || lngIndex > 35_999) {
    throw new LocationPolicyError('outside_nepal');
  }

  return {
    latitudeE3,
    longitudeE3,
    publicLocation: {
      policyVersion: 'grid-0.01deg-v1',
      wardId: input.wardId,
      wardGeometryVersion: input.policy.wardGeometryVersion,
      latIndex,
      lngIndex,
      coarseCellId: `g1-${latIndex}-${lngIndex}`,
      centerLatE6: -90_000_000 + latIndex * 10_000 + 5_000,
      centerLngE6: -180_000_000 + lngIndex * 10_000 + 5_000,
      uncertaintyRadiusM: 800,
    },
  };
}
