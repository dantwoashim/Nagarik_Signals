import { createHash } from 'node:crypto';

import { z } from 'zod';

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const recordKind = z.enum([
  'community_report',
  'public_source',
  'illustrative_sample',
  'qa_fixture',
]);

const legacyIssueSchema = z
  .object({
    issueId: z.number().int().positive(),
    title: z.string().min(8).max(240),
    description: z.string().min(20).max(4_000),
    category: z.enum([
      'road',
      'waste',
      'water',
      'electricity_lighting',
      'public_facility',
      'public_safety_hazard',
      'other_public_infrastructure',
    ]),
    wardId: z.string().min(1).max(120),
    locality: z.string().min(1).max(240),
    status: z.string().min(1).max(80),
    recordKind,
    provenance: z.unknown().nullable(),
    verificationCount: z.number().int().nonnegative(),
    updateCount: z.number().int().nonnegative(),
    firstObservedAt: z.string().datetime(),
    proofAnchoredAt: z.string().datetime().nullable(),
    safetyReviewStatus: z.enum(['visible', 'hidden_media', 'disputed', 'rejected', 'resolved']),
    latDisplay: z.number().min(-90).max(90),
    lngDisplay: z.number().min(-180).max(180),
    proof: z.object({
      metadataHash: hash,
      evidenceHash: hash,
      locationHash: hash,
      timelineHash: hash,
    }),
  })
  .passthrough();

const legacyModelSchema = z
  .object({
    version: z.literal(1),
    issues: z.array(legacyIssueSchema),
  })
  .passthrough();

type LegacyIssue = z.infer<typeof legacyIssueSchema>;

export type PreparedLegacyIssue = {
  legacyIssueId: number;
  issueId: string;
  publicId: string;
  versionId: string;
  title: string;
  narrative: string;
  category: string;
  wardId: string;
  wardLabel: string;
  legacyStatus: string;
  recordKind: 'community_report' | 'public_source';
  provenance: unknown;
  publicLocation: {
    latRounded: number;
    lngRounded: number;
    precision: 3;
  };
  metadataHash: string;
  evidenceHash: string;
  locationHash: string;
  timelineHash: string;
  signalCount: number;
  updateCount: number;
  observedAt: string;
  publishedAt: string;
};

export type LegacyImportPlan = {
  schemaVersion: 'legacy-import-v1';
  canonicalSourceSha256: string;
  rawSourceSha256: string;
  issueSetSha256: string;
  sourceIssueCount: number;
  eligibleIssueCount: number;
  excludedCounts: Record<string, number>;
  issues: PreparedLegacyIssue[];
};

export interface LegacyImportQuery {
  query(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<Array<Record<string, unknown>>>;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function deterministicUuid(namespace: string, value: string): string {
  const bytes = createHash('sha256').update(`${namespace}\0${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function toPreparedIssue(issue: LegacyIssue): PreparedLegacyIssue {
  const key = String(issue.issueId);
  return {
    legacyIssueId: issue.issueId,
    issueId: deterministicUuid('nagarik:legacy:issue:v1', key),
    publicId: deterministicUuid('nagarik:legacy:public:v1', key),
    versionId: deterministicUuid('nagarik:legacy:version:v1', key),
    title: issue.title,
    narrative: issue.description,
    category: issue.category,
    wardId: issue.wardId,
    wardLabel: issue.locality,
    legacyStatus: issue.status,
    recordKind: issue.recordKind as 'community_report' | 'public_source',
    provenance: issue.provenance,
    publicLocation: {
      latRounded: Number(issue.latDisplay.toFixed(3)),
      lngRounded: Number(issue.lngDisplay.toFixed(3)),
      precision: 3,
    },
    metadataHash: issue.proof.metadataHash,
    evidenceHash: issue.proof.evidenceHash,
    locationHash: issue.proof.locationHash,
    timelineHash: issue.proof.timelineHash,
    signalCount: issue.verificationCount,
    updateCount: issue.updateCount,
    observedAt: issue.firstObservedAt,
    publishedAt: issue.proofAnchoredAt ?? issue.firstObservedAt,
  };
}

export function prepareLegacyImport(rawSource: string): LegacyImportPlan {
  const parsed = legacyModelSchema.parse(JSON.parse(rawSource));
  const seen = new Set<number>();
  const excludedCounts: Record<string, number> = {};
  const eligible: LegacyIssue[] = [];

  for (const issue of parsed.issues) {
    if (seen.has(issue.issueId)) {
      throw new Error(`duplicate_legacy_issue_id:${issue.issueId}`);
    }
    seen.add(issue.issueId);

    if (issue.recordKind === 'community_report' || issue.recordKind === 'public_source') {
      eligible.push(issue);
    } else {
      excludedCounts[issue.recordKind] = (excludedCounts[issue.recordKind] ?? 0) + 1;
    }
  }

  const issues = eligible.sort((left, right) => left.issueId - right.issueId).map(toPreparedIssue);
  const canonicalSource = stableJson(parsed);

  return {
    schemaVersion: 'legacy-import-v1',
    canonicalSourceSha256: sha256(canonicalSource),
    rawSourceSha256: sha256(rawSource),
    issueSetSha256: sha256(stableJson(issues)),
    sourceIssueCount: parsed.issues.length,
    eligibleIssueCount: issues.length,
    excludedCounts,
    issues,
  };
}

export async function applyLegacyImport(
  transaction: LegacyImportQuery,
  plan: LegacyImportPlan,
  organizationId: string,
): Promise<{ noOp: boolean; importedIssueCount: number; runId: string }> {
  const organization = await transaction.query(
    'select id from nagarik.organizations where id = $1::uuid',
    [organizationId],
  );
  if (organization.length !== 1) {
    throw new Error('legacy_import_organization_not_found');
  }

  const existing = await transaction.query(
    `select id
     from nagarik.legacy_import_runs
     where source_sha256 = decode($1, 'hex')
       and mode = 'commit'
       and state = 'completed'`,
    [plan.canonicalSourceSha256],
  );
  if (existing.length > 0) {
    return {
      noOp: true,
      importedIssueCount: 0,
      runId: String(existing[0].id),
    };
  }

  const runId = deterministicUuid('nagarik:legacy:import-run:v1', plan.canonicalSourceSha256);
  await transaction.query(
    `insert into nagarik.legacy_import_runs(
       id, source_sha256, mode, state, counts, checksum_report
     )
     values (
       $1::uuid,
       decode($2, 'hex'),
       'commit',
       'running',
       $3::jsonb,
       $4::jsonb
     )`,
    [
      runId,
      plan.canonicalSourceSha256,
      JSON.stringify({
        source: plan.sourceIssueCount,
        eligible: plan.eligibleIssueCount,
        excluded: plan.excludedCounts,
      }),
      JSON.stringify({
        schemaVersion: plan.schemaVersion,
        canonicalSourceSha256: plan.canonicalSourceSha256,
        rawSourceSha256: plan.rawSourceSha256,
        issueSetSha256: plan.issueSetSha256,
      }),
    ],
  );

  for (const issue of plan.issues) {
    await transaction.query(
      `insert into nagarik.issues(
         id,
         public_id,
         organization_id,
         workflow_version,
         legacy_issue_id,
         record_kind,
         publication_state,
         legacy_status,
         checkpoint_update_count,
         projected_timeline_head,
         confirmed_update_count,
         confirmed_timeline_head,
         created_at,
         updated_at
       )
       values (
         $1::uuid,
         $2::uuid,
         $3::uuid,
         'v1_legacy',
         $4::bigint,
         $5,
         'published',
         $6,
         $7::bigint,
         decode($8, 'hex'),
         $7::bigint,
         decode($8, 'hex'),
         $9::timestamptz,
         $9::timestamptz
       )`,
      [
        issue.issueId,
        issue.publicId,
        organizationId,
        issue.legacyIssueId,
        issue.recordKind,
        issue.legacyStatus,
        issue.updateCount,
        issue.timelineHash,
        issue.publishedAt,
      ],
    );

    await transaction.query(
      `insert into nagarik.issue_versions(
         id,
         issue_id,
         version_number,
         state,
         title,
         narrative,
         category,
         ward_id,
         ward_label,
         locality_label,
         public_location,
         public_provenance,
         metadata_hash,
         evidence_hash,
         location_hash,
         public_reason,
         version_created_at,
         published_at
       )
       values (
         $1::uuid,
         $2::uuid,
         1,
         'published',
         $3,
         $4,
         $5,
         $6,
         $7,
         $7,
         $8::jsonb,
         $9::jsonb,
         decode($10, 'hex'),
         decode($11, 'hex'),
         decode($12, 'hex'),
         'legacy_v1_import',
         $13::timestamptz,
         $14::timestamptz
       )`,
      [
        issue.versionId,
        issue.issueId,
        issue.title,
        issue.narrative,
        issue.category,
        issue.wardId,
        issue.wardLabel,
        JSON.stringify(issue.publicLocation),
        JSON.stringify(issue.provenance),
        issue.metadataHash,
        issue.evidenceHash,
        issue.locationHash,
        issue.observedAt,
        issue.publishedAt,
      ],
    );

    await transaction.query(
      `update nagarik.issues
       set current_version_id = $2::uuid
       where id = $1::uuid`,
      [issue.issueId, issue.versionId],
    );

    await transaction.query(
      `insert into public.issue_projection(
         public_id,
         workflow_version,
         version_id,
         publication_state,
         title,
         summary,
         narrative,
         category,
         ward,
         location,
         provenance,
         legacy_status,
         signal_count,
         legacy_signal_count,
         published_at,
         updated_at
       )
       values (
         $1::uuid,
         'v1_legacy',
         $2::uuid,
         'published',
         $3,
         $4,
         $4,
         $5,
         $6::jsonb,
         $7::jsonb,
         $8::jsonb,
         $9,
         $10::bigint,
         $10::bigint,
         $11::timestamptz,
         $11::timestamptz
       )`,
      [
        issue.publicId,
        issue.versionId,
        issue.title,
        issue.narrative,
        issue.category,
        JSON.stringify({
          id: issue.wardId,
          label: issue.wardLabel,
        }),
        JSON.stringify(issue.publicLocation),
        JSON.stringify(issue.provenance),
        issue.legacyStatus,
        issue.signalCount,
        issue.publishedAt,
      ],
    );
  }

  await transaction.query(
    `update nagarik.legacy_import_runs
     set
       state = 'completed',
       completed_at = now(),
       counts = counts || $2::jsonb
     where id = $1::uuid`,
    [runId, JSON.stringify({ imported: plan.issues.length })],
  );

  return {
    noOp: false,
    importedIssueCount: plan.issues.length,
    runId,
  };
}
