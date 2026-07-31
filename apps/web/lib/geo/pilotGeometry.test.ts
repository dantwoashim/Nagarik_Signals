import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LocationPolicyError,
  parsePilotGeometryPolicy,
  roundE6ToE3,
  validatePrivateLocation,
} from './pilotGeometry';

const policy = parsePilotGeometryPolicy({
  boundaryVersion: 'pilot-v1',
  wardGeometryVersion: 'wards-v1',
  boundaryGeojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'pilot' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [85.2, 27.6],
              [85.5, 27.6],
              [85.5, 27.9],
              [85.2, 27.9],
              [85.2, 27.6],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { kind: 'ward', wardId: 'ward-1' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [85.3, 27.65],
              [85.4, 27.65],
              [85.4, 27.75],
              [85.3, 27.75],
              [85.3, 27.65],
            ],
          ],
        },
      },
    ],
  },
});

test('E6 coordinates use exact half-away-from-zero rounding', () => {
  assert.equal(roundE6ToE3(27_700_499), 27_700);
  assert.equal(roundE6ToE3(27_700_500), 27_701);
  assert.equal(roundE6ToE3(-27_700_499), -27_700);
  assert.equal(roundE6ToE3(-27_700_500), -27_701);
  assert.equal(roundE6ToE3(0), 0);
  assert.throws(() => roundE6ToE3(1.5), /coordinate_must_be_integer_e6/);
});

test('pilot and ward polygons gate private points before coarse public derivation', () => {
  const result = validatePrivateLocation({
    latitudeE6: 27_700_123,
    longitudeE6: 85_350_456,
    wardId: 'ward-1',
    geometryVersion: 'wards-v1',
    intakePolicyVersion: 'pilot-v1',
    policy,
  });

  assert.equal(result.latitudeE3, 27_700);
  assert.equal(result.longitudeE3, 85_350);
  assert.deepEqual(result.publicLocation, {
    policyVersion: 'grid-0.01deg-v1',
    wardId: 'ward-1',
    wardGeometryVersion: 'wards-v1',
    latIndex: 11_770,
    lngIndex: 26_535,
    coarseCellId: 'g1-11770-26535',
    centerLatE6: 27_705_000,
    centerLngE6: 85_355_000,
    uncertaintyRadiusM: 800,
  });

  assert.throws(
    () =>
      validatePrivateLocation({
        latitudeE6: 27_800_000,
        longitudeE6: 85_350_000,
        wardId: 'ward-1',
        geometryVersion: 'wards-v1',
        intakePolicyVersion: 'pilot-v1',
        policy,
      }),
    (error: unknown) =>
      error instanceof LocationPolicyError && error.code === 'ward_location_mismatch',
  );
});
