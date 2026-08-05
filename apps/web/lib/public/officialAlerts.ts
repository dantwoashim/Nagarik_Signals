import type { OfficialAlert } from './contracts';

const bipadOrigin = 'https://bipadportal.gov.np';
const maximumAgeMs = 24 * 60 * 60 * 1_000;

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function textValue(value: unknown, maximumLength = 180): string | null {
  if (typeof value !== 'string') return null;
  const printable = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    })
    .join('');
  const cleaned = printable
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,(?=\S)/g, ', ')
    .trim();
  return cleaned ? cleaned.slice(0, maximumLength) : null;
}

function dateValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function pointValue(value: unknown): { latitude: number; longitude: number } | null {
  const coordinates = objectValue(value).coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < 25.8 ||
    latitude > 31.1 ||
    longitude < 79.6 ||
    longitude > 89.2
  ) {
    return null;
  }
  return {
    latitude: Number(latitude.toFixed(3)),
    longitude: Number(longitude.toFixed(3)),
  };
}

function isFresh(publishedAt: string, now: Date): boolean {
  const age = now.getTime() - Date.parse(publishedAt);
  return age >= -10 * 60 * 1_000 && age <= maximumAgeMs;
}

function minutesOld(publishedAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(publishedAt)) / 60_000));
}

function referenceFields(value: unknown): JsonObject {
  if (typeof value !== 'string' || value.length > 250_000) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    const item = Array.isArray(parsed) ? parsed[0] : parsed;
    return objectValue(objectValue(item).fields);
  } catch {
    return {};
  }
}

function sourceDetailUrl(kind: 'alert' | 'incident', id: number): string {
  return `${bipadOrigin}/api/v1/${kind}/${id}/`;
}

export function transformBipadAlert(value: unknown, now = new Date()): OfficialAlert | null {
  const row = objectValue(value);
  const id = Number(row.id);
  const source = textValue(row.source, 24);
  const point = pointValue(row.point);
  const publishedAt = dateValue(row.createdOn);
  if (
    !Number.isInteger(id) ||
    id < 1 ||
    !point ||
    !publishedAt ||
    !isFresh(publishedAt, now) ||
    row.verified !== true ||
    row.public !== true ||
    (source !== 'dor' && source !== 'doe')
  ) {
    return null;
  }

  const fields = referenceFields(row.referenceData);
  const observedAt = dateValue(row.startedOn) ?? dateValue(fields.date_time);
  const expiresAt = dateValue(row.expireOn);
  const expired = expiresAt ? Date.parse(expiresAt) <= now.getTime() : false;

  if (source === 'dor') {
    const place = textValue(fields.location, 120) ?? textValue(row.title, 120);
    if (!place) return null;
    const reason = textValue(fields.closure_reason, 80) ?? 'a road hazard';
    const road = textValue(fields.road_refno, 24);
    const reportedStatus = textValue(fields.status, 24)?.toUpperCase();
    const actualEnd = dateValue(fields.date_roadblock_end);
    const estimatedEnd = dateValue(fields.date_roadblock_end_estimated);
    const status =
      actualEnd || reportedStatus === 'OPEN'
        ? 'resolved'
        : expired || (estimatedEnd !== null && Date.parse(estimatedEnd) <= now.getTime())
          ? 'recheck_due'
          : 'active';
    const stateCopy =
      status === 'resolved'
        ? 'The feed records this section as reopened.'
        : status === 'recheck_due'
          ? 'The last closure window has passed; reopening still needs confirmation.'
          : 'The latest official feed state is closed.';
    return {
      id: `bipad-alert-${id}`,
      kind: 'road_closure',
      title: `Road closure reported in ${place}`,
      summary: `${road ? `${road} was` : 'This road section was'} reported closed after ${reason.toLowerCase()}. ${stateCopy}`,
      category: 'road',
      place,
      ...point,
      status,
      sourceLabel: 'Department of Roads via BIPAD',
      sourceUrl: sourceDetailUrl('alert', id),
      publishedAt,
      observedAt,
      expiresAt,
      minutesOld: minutesOld(publishedAt, now),
    };
  }

  const place = textValue(fields.identifier, 120) ?? textValue(fields.title, 120);
  const aqi = Number(fields.aqi);
  if (!place || !Number.isFinite(aqi) || aqi < 0 || aqi > 1_000) return null;
  return {
    id: `bipad-alert-${id}`,
    kind: 'air_quality',
    title: `Air-quality alert at ${place}`,
    summary: `The official monitoring feed reported an AQI of ${Math.round(aqi)}. This value may change as the station updates.`,
    category: 'public_safety_hazard',
    place,
    ...point,
    status: expired ? 'recheck_due' : 'active',
    sourceLabel: 'Department of Environment via BIPAD',
    sourceUrl: sourceDetailUrl('alert', id),
    publishedAt,
    observedAt,
    expiresAt,
    minutesOld: minutesOld(publishedAt, now),
  };
}

export function transformBipadIncident(value: unknown, now = new Date()): OfficialAlert | null {
  const row = objectValue(value);
  const id = Number(row.id);
  const point = pointValue(row.point);
  const publishedAt = dateValue(row.createdOn);
  const title = textValue(row.title, 160);
  const place = textValue(row.streetAddress, 120) ?? title;
  if (
    !Number.isInteger(id) ||
    id < 1 ||
    !point ||
    !publishedAt ||
    !title ||
    !place ||
    !isFresh(publishedAt, now) ||
    row.verified !== true ||
    row.approved !== true ||
    !/\b(flood|landslide|road|highway|bridge|forest|river|school|hospital)\b/i.test(title) ||
    /\b(home|house|death|dead|body|injur|missing|victim)\b/i.test(title)
  ) {
    return null;
  }

  const isFlood = /\bflood\b/i.test(title);
  return {
    id: `bipad-incident-${id}`,
    kind: 'incident',
    title,
    summary: `The Government of Nepal disaster portal records this verified ${isFlood ? 'flood' : 'infrastructure'} incident. No physical follow-up by Nagarik Signal is implied.`,
    category: isFlood ? 'water' : 'public_safety_hazard',
    place,
    ...point,
    status: 'reported',
    sourceLabel: 'Government of Nepal BIPAD',
    sourceUrl: sourceDetailUrl('incident', id),
    publishedAt,
    observedAt: dateValue(row.reportedOn) ?? dateValue(row.incidentOn),
    expiresAt: null,
    minutesOld: minutesOld(publishedAt, now),
  };
}

async function readBipadList(path: 'alert' | 'incident'): Promise<unknown[]> {
  const response = await fetch(`${bipadOrigin}/api/v1/${path}/?limit=40&ordering=-id`, {
    headers: { Accept: 'application/json', 'User-Agent': 'NagarikSignal/1.0 public-source-map' },
    signal: AbortSignal.timeout(5_000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`bipad_${path}_unavailable`);
  const payload = objectValue(await response.json());
  return Array.isArray(payload.results) ? payload.results : [];
}

export async function readOfficialAlerts(now = new Date()): Promise<OfficialAlert[]> {
  const results = await Promise.allSettled([readBipadList('alert'), readBipadList('incident')]);
  if (results.every((result) => result.status === 'rejected')) {
    throw new Error('bipad_unavailable');
  }
  const alerts =
    results[0].status === 'fulfilled'
      ? results[0].value.flatMap((item) => {
          const alert = transformBipadAlert(item, now);
          return alert ? [alert] : [];
        })
      : [];
  const incidents =
    results[1].status === 'fulfilled'
      ? results[1].value.flatMap((item) => {
          const incident = transformBipadIncident(item, now);
          return incident ? [incident] : [];
        })
      : [];
  return [...alerts, ...incidents]
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, 20);
}
