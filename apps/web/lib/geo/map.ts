import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';
import type { CivicIssue } from '../types';

export const detailedMapStyleUrl =
  process.env.NEXT_PUBLIC_NAGARIK_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty';

export const nepalMapBounds: [[number, number], [number, number]] = [
  [79.6, 25.8],
  [89.2, 31.1],
];

// The interaction envelope leaves enough surrounding context for Nepal to fit
// comfortably in tall mobile viewports without clipping edge records.
export const nepalMapInteractionBounds: [[number, number], [number, number]] = [
  [75, 21.5],
  [94, 35.5],
];

export const kathmanduCenter: [number, number] = [85.324, 27.708];
export const publicLocationRadiusMeters = 120;

export type CivicPointProperties = {
  id: string;
  issueId: number;
  title: string;
  locality: string;
  category: CivicIssue['category'];
  status: CivicIssue['status'];
  recordKind: CivicIssue['recordKind'];
  verificationCount: number;
  proofStatus: CivicIssue['proof']['proofStatus'];
};

export function roundPublicCoordinate(value: number) {
  return Number(value.toFixed(3));
}

export function isInsideNepalMapBounds(lat: number, lng: number) {
  return lat >= nepalMapBounds[0][1]
    && lat <= nepalMapBounds[1][1]
    && lng >= nepalMapBounds[0][0]
    && lng <= nepalMapBounds[1][0];
}

export function issuesToFeatureCollection(issues: CivicIssue[]): FeatureCollection<Point, CivicPointProperties> {
  return {
    type: 'FeatureCollection',
    features: issues.map((issue) => ({
      type: 'Feature',
      id: issue.id,
      geometry: {
        type: 'Point',
        coordinates: [issue.lngDisplay, issue.latDisplay],
      },
      properties: {
        id: issue.id,
        issueId: issue.issueId,
        title: issue.title,
        locality: issue.locality,
        category: issue.category,
        status: issue.status,
        recordKind: issue.recordKind,
        verificationCount: issue.verificationCount,
        proofStatus: issue.proof.proofStatus,
      },
    })),
  };
}

export function publicLocationCircle(
  lat: number,
  lng: number,
  radiusMeters = publicLocationRadiusMeters,
  steps = 56,
): Feature<Polygon> {
  const latitudeDegrees = radiusMeters / 111_320;
  const longitudeDegrees = radiusMeters / (111_320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  const ring: [number, number][] = [];

  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    ring.push([
      lng + Math.cos(angle) * longitudeDegrees,
      lat + Math.sin(angle) * latitudeDegrees,
    ]);
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
  };
}

export function issueBounds(issues: CivicIssue[]): [[number, number], [number, number]] | null {
  if (!issues.length) return null;
  let west = issues[0].lngDisplay;
  let east = issues[0].lngDisplay;
  let south = issues[0].latDisplay;
  let north = issues[0].latDisplay;

  for (const issue of issues.slice(1)) {
    west = Math.min(west, issue.lngDisplay);
    east = Math.max(east, issue.lngDisplay);
    south = Math.min(south, issue.latDisplay);
    north = Math.max(north, issue.latDisplay);
  }

  if (west === east && south === north) {
    return [[west - 0.02, south - 0.015], [east + 0.02, north + 0.015]];
  }

  return [[west, south], [east, north]];
}
