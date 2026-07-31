import { z } from 'zod';

const category = z.enum([
  'road',
  'waste',
  'water',
  'electricity_lighting',
  'public_facility',
  'public_safety_hazard',
  'other_public_infrastructure',
]);

const inputSchema = z
  .object({
    schemaVersion: z.literal('submission-v2'),
    title: z.string(),
    description: z.string(),
    category,
    observedOn: z.string(),
    mediaReceipt: z.string().min(1),
    location: z
      .object({
        latitudeE6: z.number().int().min(-90_000_000).max(90_000_000),
        longitudeE6: z.number().int().min(-180_000_000).max(180_000_000),
        wardId: z.string().min(1).max(120),
        geometryVersion: z.string().min(1).max(120),
        localityLabel: z.string().optional(),
      })
      .strict(),
    acknowledgements: z
      .object({
        publicInfrastructureOnly: z.literal(true),
        nonEmergency: z.literal(true),
        publicationAfterReview: z.literal(true),
      })
      .strict(),
  })
  .strict();

export type SubmissionInput = {
  schemaVersion: 'submission-v2';
  title: string;
  description: string;
  category: z.infer<typeof category>;
  observedOn: string;
  mediaReceipt: string;
  location: {
    latitudeE6: number;
    longitudeE6: number;
    wardId: string;
    geometryVersion: string;
    localityLabel?: string;
  };
  acknowledgements: {
    publicInfrastructureOnly: true;
    nonEmergency: true;
    publicationAfterReview: true;
  };
};

export class SubmissionInputError extends Error {
  constructor(public readonly code: 'submission_invalid' | 'category_not_allowed') {
    super(code);
    this.name = 'SubmissionInputError';
  }
}

function codePointLength(value: string): number {
  return [...value].length;
}

function normalizedSingleLine(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function normalizedNarrative(value: string): string {
  return value.normalize('NFC').trim().replace(/\r\n?/g, '\n');
}

function realDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function kathmanduDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function parseSubmissionInput(value: unknown, today = kathmanduDate()): SubmissionInput {
  const parsed = inputSchema.safeParse(value);
  if (!parsed.success) throw new SubmissionInputError('submission_invalid');

  const title = normalizedSingleLine(parsed.data.title);
  const description = normalizedNarrative(parsed.data.description);
  const localityLabel = parsed.data.location.localityLabel
    ? normalizedSingleLine(parsed.data.location.localityLabel)
    : undefined;
  if (
    codePointLength(title) < 8 ||
    codePointLength(title) > 120 ||
    codePointLength(description) < 20 ||
    codePointLength(description) > 2_000 ||
    (localityLabel &&
      (codePointLength(localityLabel) < 1 || codePointLength(localityLabel) > 80)) ||
    !realDate(parsed.data.observedOn) ||
    parsed.data.observedOn < '2000-01-01' ||
    parsed.data.observedOn > today
  ) {
    throw new SubmissionInputError('submission_invalid');
  }

  return {
    ...parsed.data,
    title,
    description,
    location: {
      ...parsed.data.location,
      ...(localityLabel ? { localityLabel } : {}),
    },
  };
}
