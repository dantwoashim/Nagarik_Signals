import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isInsideNepalMapBounds,
  issueBounds,
  issuesToFeatureCollection,
  publicLocationCircle,
  roundPublicCoordinate,
} from './map';
import type { CivicIssue } from '../types';

const issue = {
  id: 'map-test',
  issueId: 42,
  title: 'Public drain cover requires follow-up',
  locality: 'Kathmandu Ward 10',
  category: 'water',
  status: 'submitted',
  recordKind: 'community_report',
  verificationCount: 2,
  latDisplay: 27.692,
  lngDisplay: 85.336,
  proof: { proofStatus: 'indexed_devnet' },
} as CivicIssue;

test('public coordinates round to three decimals before map state', () => {
  assert.equal(roundPublicCoordinate(27.689876), 27.69);
  assert.equal(roundPublicCoordinate(85.321234), 85.321);
});

test('supported map bounds include Nepal and reject distant coordinates', () => {
  assert.equal(isInsideNepalMapBounds(27.7, 85.3), true);
  assert.equal(isInsideNepalMapBounds(35.7, 139.7), false);
});

test('GeoJSON points preserve longitude-latitude coordinate order', () => {
  const collection = issuesToFeatureCollection([issue]);
  assert.deepEqual(collection.features[0].geometry.coordinates, [85.336, 27.692]);
  assert.equal(collection.features[0].properties.id, 'map-test');
});

test('the public uncertainty polygon is closed and surrounds the rounded point', () => {
  const circle = publicLocationCircle(issue.latDisplay, issue.lngDisplay);
  const ring = circle.geometry.coordinates[0];
  assert.deepEqual(ring[0], ring.at(-1));
  assert.ok(ring.length >= 48);
  assert.ok(Math.min(...ring.map(([lng]) => lng)) < issue.lngDisplay);
  assert.ok(Math.max(...ring.map(([lng]) => lng)) > issue.lngDisplay);
  assert.ok(Math.min(...ring.map(([, lat]) => lat)) < issue.latDisplay);
  assert.ok(Math.max(...ring.map(([, lat]) => lat)) > issue.latDisplay);
});

test('map bounds expand a single public point into a useful camera area', () => {
  assert.deepEqual(issueBounds([issue]), [[85.316, 27.677], [85.356, 27.707]]);
});
