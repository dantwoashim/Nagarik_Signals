import 'server-only';

import { createHash, createHmac, randomUUID } from 'node:crypto';
import type {
  AuthorityHandoff,
  CivicIssue,
  DashboardStats,
  HandoffStats,
  IssueCategory,
  IssueStatus,
  RecordKind,
  SafetyReviewStatus,
  StatusTimelineEntry,
} from '../types';
import { buildAuthorityHandoff, verifyAuthorityHandoffChain } from '../handoffs/hash';
import { handoffDraftMatches, nextHandoffStates, type ValidatedHandoffDraft } from '../handoffs/policy';
import { isClosedStatus } from '../constants/statuses';
import { publicPreviewReadOnly } from '../deployment';
import { readModelPath } from '../server/paths';
import { explorerUrl } from '../solana/explorer';
import bundledPublicSnapshot from '../../../../data/read-model/nagarik-signal.json';
import { createJsonStore, type DurableStorageMode } from './jsonStore';

export type VerificationRecord = {
  issueId: number;
  verifierPubkey: string;
  verifierMode: 'session' | 'wallet';
  verificationPda: string;
  txSig: string;
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  sessionPubkey: string;
  sessionHash: string;
  displayName: string | null;
  createdAt: string;
  lastSeenAt: string;
};

export type StatusUpdateRecord = {
  issueId: number;
  seq: number;
  updaterPubkey: string;
  oldStatus: IssueStatus;
  newStatus: IssueStatus;
  proofHash: string;
  previousTimelineHash: string | null;
  newTimelineHash: string;
  statusUpdatePda: string;
  txSig: string;
  note: string | null;
  proofPhotoUrl: string | null;
  createdAt: string;
};

export type StewardRecord = {
  walletPubkey: string;
  displayName: string | null;
  active: boolean;
  createdAt: string;
  revokedAt: string | null;
};

export type RequestEventOutcome = 'allowed' | 'blocked' | 'success' | 'failure';

export type RequestEventMetadata = Record<string, string | number | boolean | null>;

export type RequestEventRecord = {
  id: string;
  scope: string;
  identifierHash: string;
  outcome: RequestEventOutcome;
  createdAt: string;
  metadata: RequestEventMetadata;
};

export type RateLimitBucket = {
  scope: string;
  identifierHash: string;
  capacity: number;
  windowMs: number;
  tokens: number;
  lastRefillAt: string;
  updatedAt: string;
};

export type ReadModel = {
  version: 1;
  storage: DurableStorageMode;
  updatedAt: string;
  issues: CivicIssue[];
  verifications: VerificationRecord[];
  statusUpdates: StatusUpdateRecord[];
  authorityHandoffs: AuthorityHandoff[];
  sessions: SessionRecord[];
  stewards: StewardRecord[];
  requestEvents?: RequestEventRecord[];
  rateLimits?: RateLimitBucket[];
};

export type IssueRecordKind = RecordKind;

export type IssueListFilters = {
  ward?: string | null;
  category?: string | null;
  status?: string | null;
  recordKind?: IssueRecordKind | null;
  scope?: 'public' | 'samples' | 'all' | null;
  sort?: string | null;
  limit?: number | null;
  cursor?: number | null;
};

export type RateLimitInput = {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
  now?: Date | string | number;
  metadata?: RequestEventMetadata;
};

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: string;
  retryAfterSeconds: number;
};

const DEFAULT_BLOB_PATH = 'nagarik-signal/state/read-model.json';
const DEFAULT_REQUEST_EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const DEFAULT_REQUEST_EVENT_LIMIT = 5_000;

function initialModel(): ReadModel {
  const snapshot = structuredClone(bundledPublicSnapshot) as unknown as ReadModel;
  return {
    ...snapshot,
    storage: 'local_json',
    requestEvents: snapshot.requestEvents ?? [],
    rateLimits: snapshot.rateLimits ?? [],
    authorityHandoffs: snapshot.authorityHandoffs ?? [],
  };
}

function blobPath() {
  return process.env.NAGARIK_READ_MODEL_BLOB_PATH?.trim() || DEFAULT_BLOB_PATH;
}

function resolvedRecordKind(issue: unknown): IssueRecordKind {
  const row = issue && typeof issue === 'object' ? (issue as Record<string, unknown>) : {};
  const explicit = row.recordKind;
  if (
    explicit === 'community_report' ||
    explicit === 'public_source' ||
    explicit === 'illustrative_sample' ||
    explicit === 'qa_fixture'
  ) {
    return explicit;
  }
  const proof = row.proof && typeof row.proof === 'object' ? (row.proof as Record<string, unknown>) : {};
  return proof.proofStatus === 'seeded_demo' ? 'illustrative_sample' : 'qa_fixture';
}

function normalizeReadModel(value: unknown, mode: DurableStorageMode): ReadModel {
  const raw = value && typeof value === 'object' ? (value as Partial<ReadModel>) : {};
  const fallback = initialModel();
  return {
    ...fallback,
    ...raw,
    version: 1,
    storage: mode,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : fallback.updatedAt,
    issues: Array.isArray(raw.issues)
      ? raw.issues.map((issue) => ({
          ...issue,
          recordKind: resolvedRecordKind(issue),
          provenance: issue.provenance ?? null,
        }))
      : [],
    verifications: Array.isArray(raw.verifications) ? raw.verifications : [],
    statusUpdates: Array.isArray(raw.statusUpdates) ? raw.statusUpdates : [],
    authorityHandoffs: Array.isArray(raw.authorityHandoffs) ? raw.authorityHandoffs : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    stewards: Array.isArray(raw.stewards) ? raw.stewards : [],
    requestEvents: Array.isArray(raw.requestEvents) ? raw.requestEvents : [],
    rateLimits: Array.isArray(raw.rateLimits) ? raw.rateLimits : [],
  };
}

const modelStore = createJsonStore<ReadModel>({
  localPath: readModelPath,
  blobPath,
  create: initialModel,
  normalize: normalizeReadModel,
  prepareForWrite(model, mode) {
    model.storage = mode;
    model.updatedAt = new Date().toISOString();
    return model;
  },
});

function assertWritable() {
  if (publicPreviewReadOnly) throw new Error('public_preview_read_only');
}

async function mutateReadModel<R>(mutation: (model: ReadModel) => R) {
  assertWritable();
  return modelStore.mutate(mutation);
}

function requestEventRetentionMs(minimumMs = 0) {
  const parsed = Number.parseInt(process.env.NAGARIK_REQUEST_EVENT_RETENTION_MS ?? '', 10);
  const configured = Number.isFinite(parsed) ? parsed : DEFAULT_REQUEST_EVENT_RETENTION_MS;
  return Math.max(configured, minimumMs, 60_000);
}

function requestEventLimit() {
  const parsed = Number.parseInt(process.env.NAGARIK_REQUEST_EVENT_LIMIT ?? '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_REQUEST_EVENT_LIMIT;
  return Math.min(Math.max(parsed, 100), 50_000);
}

function validTimestamp(value: string) {
  return Number.isFinite(Date.parse(value));
}

function pruneRequestState(model: ReadModel, nowMs: number, retentionMs: number) {
  const cutoff = nowMs - retentionMs;
  model.requestEvents = (model.requestEvents ?? []).filter(
    (event) => validTimestamp(event.createdAt) && Date.parse(event.createdAt) >= cutoff
  );
  model.rateLimits = (model.rateLimits ?? []).filter(
    (bucket) => validTimestamp(bucket.updatedAt) && Date.parse(bucket.updatedAt) >= cutoff
  );
}

function appendRequestEvent(model: ReadModel, event: RequestEventRecord) {
  const events = [...(model.requestEvents ?? []), event];
  const maxEvents = requestEventLimit();
  model.requestEvents = events.length > maxEvents ? events.slice(events.length - maxEvents) : events;
}

function sanitizeScope(scope: string) {
  const normalized = scope.trim();
  if (!normalized || normalized.length > 80 || !/^[a-zA-Z0-9:_-]+$/.test(normalized)) {
    throw new Error('invalid_rate_limit_scope');
  }
  return normalized;
}

function sanitizeIdentifier(identifier: string) {
  const normalized = identifier.trim();
  if (!normalized || normalized.length > 1_024) throw new Error('invalid_rate_limit_identifier');
  return normalized;
}

function sanitizeMetadata(metadata: RequestEventMetadata | undefined): RequestEventMetadata {
  if (!metadata) return {};
  return Object.fromEntries(
    Object.entries(metadata)
      .slice(0, 12)
      .map(([key, value]) => [key.slice(0, 64), typeof value === 'string' ? value.slice(0, 256) : value])
  );
}

function hashIdentifier(scope: string, identifier: string) {
  const material = `${scope}\0${identifier}`;
  const salt = process.env.NAGARIK_RATE_LIMIT_SALT?.trim();
  return salt
    ? createHmac('sha256', salt).update(material).digest('hex')
    : createHash('sha256').update(material).digest('hex');
}

function timestampMs(value: Date | string | number | undefined) {
  if (value === undefined) return Date.now();
  const parsed = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('invalid_request_event_timestamp');
  return parsed;
}

export function readModelStorageMode() {
  return publicPreviewReadOnly ? 'bundled_public_snapshot' : modelStore.mode();
}

export async function readModelExists() {
  if (publicPreviewReadOnly) return true;
  return modelStore.exists();
}

export async function readModel(): Promise<ReadModel> {
  if (publicPreviewReadOnly) {
    return normalizeReadModel(structuredClone(bundledPublicSnapshot), 'local_json');
  }
  return modelStore.read();
}

export async function writeModel(model: ReadModel) {
  await mutateReadModel((current) => {
    const replacement = normalizeReadModel(model, modelStore.mode());
    replacement.requestEvents = model.requestEvents ?? current.requestEvents ?? [];
    replacement.rateLimits = model.rateLimits ?? current.rateLimits ?? [];
    Object.assign(current, replacement);
  });
}

export function issueRecordKind(issue: CivicIssue): IssueRecordKind {
  return resolvedRecordKind(issue);
}

export async function listIssues(filters: IssueListFilters = {}) {
  let rows = (await readModel()).issues;
  if (filters.recordKind === 'qa_fixture') {
    rows = [];
  } else if (filters.recordKind) {
    rows = rows.filter((issue) => issueRecordKind(issue) === filters.recordKind);
    if (filters.recordKind !== 'illustrative_sample') {
      rows = rows.filter((issue) => issue.safetyReviewStatus !== 'rejected');
    }
  } else if (filters.scope === 'all') {
    rows = rows.filter((issue) => {
      const kind = issueRecordKind(issue);
      return kind !== 'qa_fixture' && (kind === 'illustrative_sample' || issue.safetyReviewStatus !== 'rejected');
    });
  } else if (filters.scope === 'samples') {
    rows = rows.filter((issue) => issueRecordKind(issue) === 'illustrative_sample');
  } else {
    rows = rows.filter((issue) => {
      const kind = issueRecordKind(issue);
      return (kind === 'community_report' || kind === 'public_source') && issue.safetyReviewStatus !== 'rejected';
    });
  }
  if (filters.ward) rows = rows.filter((issue) => issue.wardId === filters.ward);
  if (filters.category) rows = rows.filter((issue) => issue.category === filters.category);
  if (filters.status) rows = rows.filter((issue) => issue.status === filters.status);

  if (filters.sort === 'most_verified') {
    rows = rows.sort((a, b) => b.verificationCount - a.verificationCount || b.issueId - a.issueId);
  } else if (filters.sort === 'most_ignored') {
    rows = rows.sort((a, b) => daysIgnored(b) - daysIgnored(a) || b.issueId - a.issueId);
  } else {
    rows = rows.sort((a, b) => b.issueId - a.issueId);
  }

  const cursor = Math.max(0, filters.cursor ?? 0);
  const limit = Math.min(Math.max(filters.limit ?? rows.length, 1), 100);
  return rows.slice(cursor, cursor + limit);
}

export async function listModerationIssues() {
  return (await readModel()).issues
    .filter((issue) => {
      const kind = issueRecordKind(issue);
      return kind === 'community_report' || kind === 'public_source';
    })
    .sort((a, b) => b.issueId - a.issueId);
}

export async function getIssue(id: string | number) {
  const key = String(id);
  return (await readModel()).issues.find((issue) => issue.id === key || String(issue.issueId) === key) ?? null;
}

export async function listVerifications(issueId?: number) {
  const rows = (await readModel()).verifications;
  return typeof issueId === 'number' ? rows.filter((row) => row.issueId === issueId) : rows;
}

export async function findVerification(issueId: number, verifierPubkey: string) {
  return (
    (await readModel()).verifications.find(
      (row) => row.issueId === issueId && row.verifierPubkey === verifierPubkey
    ) ?? null
  );
}

export async function upsertIssue(issue: CivicIssue) {
  await mutateReadModel((model) => {
    const index = model.issues.findIndex((row) => row.issueId === issue.issueId || row.id === issue.id);
    if (index === -1) model.issues.push(issue);
    else model.issues[index] = issue;
  });
}

export async function updateSafetyReview(input: {
  issueId: number;
  safetyReviewStatus: SafetyReviewStatus;
}) {
  return mutateReadModel((model) => {
    const issue = model.issues.find((row) => row.issueId === input.issueId);
    if (!issue) return null;
    issue.safetyReviewStatus = input.safetyReviewStatus;
    return structuredClone(issue);
  });
}

export async function mediaDisplayAllowed(photoUrl: string) {
  const model = await readModel();
  const handoff = model.authorityHandoffs.find((row) => row.receiptPhotoUrl === photoUrl);
  const issue = model.issues.find((row) =>
    row.photoUrl === photoUrl || row.resolutionPhotoUrl === photoUrl || row.issueId === handoff?.issueId
  );
  if (!issue) return true;
  return issue.safetyReviewStatus !== 'hidden_media' && issue.safetyReviewStatus !== 'rejected';
}

export async function listAuthorityHandoffs(issueId?: number) {
  const rows = (await readModel()).authorityHandoffs;
  const filtered = rows
    .filter((row) => issueId === undefined || row.issueId === issueId)
    .sort((a, b) => a.issueId - b.issueId || a.seq - b.seq);
  const grouped = new Map<number, AuthorityHandoff[]>();
  for (const row of filtered) grouped.set(row.issueId, [...(grouped.get(row.issueId) ?? []), row]);
  if ([...grouped.values()].some((timeline) => !verifyAuthorityHandoffChain(timeline))) {
    throw new Error('authority_handoff_integrity_failed');
  }
  return filtered;
}

export async function addAuthorityHandoff(input: {
  issueId: number;
  idempotencyKey: string;
  expectedPreviousEventHash: string | null;
  draft: ValidatedHandoffDraft;
}) {
  return mutateReadModel((model) => {
    const existing = model.authorityHandoffs.find((row) => row.idempotencyKey === input.idempotencyKey);
    if (existing) {
      if (existing.issueId !== input.issueId || !handoffDraftMatches(existing, input.draft)) {
        throw new Error('idempotency_key_reused');
      }
      return { record: structuredClone(existing), created: false };
    }

    const issue = model.issues.find((row) => row.issueId === input.issueId);
    if (!issue) throw new Error('issue_not_found');
    const rows = model.authorityHandoffs
      .filter((row) => row.issueId === input.issueId)
      .sort((a, b) => a.seq - b.seq);
    if (!verifyAuthorityHandoffChain(rows)) throw new Error('authority_handoff_integrity_failed');
    const previous = rows.at(-1) ?? null;
    if ((previous?.eventHash ?? null) !== input.expectedPreviousEventHash) {
      throw new Error('handoff_state_changed');
    }
    if (!nextHandoffStates(previous?.state ?? null).includes(input.draft.state)) {
      throw new Error('invalid_handoff_transition');
    }
    if (previous && Date.parse(input.draft.occurredAt) < Date.parse(previous.occurredAt)) {
      throw new Error('handoff_event_precedes_previous_event');
    }

    const record = buildAuthorityHandoff({
      id: randomUUID(),
      idempotencyKey: input.idempotencyKey,
      issueId: input.issueId,
      seq: (previous?.seq ?? 0) + 1,
      draft: input.draft,
      previousEventHash: previous?.eventHash ?? null,
      createdAt: new Date().toISOString(),
    });
    model.authorityHandoffs = [...model.authorityHandoffs, record]
      .sort((a, b) => a.issueId - b.issueId || a.seq - b.seq);
    return { record: structuredClone(record), created: true };
  });
}

export async function authorityHandoffOverview(limit = 6, now = new Date()) {
  const model = await readModel();
  const publicIssueIds = new Set(model.issues
    .filter((issue) => {
      const kind = issueRecordKind(issue);
      return (kind === 'community_report' || kind === 'public_source') && issue.safetyReviewStatus !== 'rejected';
    })
    .map((issue) => issue.issueId));
  const events = model.authorityHandoffs.filter((row) => publicIssueIds.has(row.issueId));
  const byIssue = new Map<number, AuthorityHandoff[]>();
  for (const event of events) byIssue.set(event.issueId, [...(byIssue.get(event.issueId) ?? []), event]);
  if ([...byIssue.values()].some((timeline) => !verifyAuthorityHandoffChain(timeline))) {
    throw new Error('authority_handoff_integrity_failed');
  }
  const latest = [...byIssue.values()].map((rows) => rows.sort((a, b) => a.seq - b.seq).at(-1)!);
  const nowMs = now.getTime();
  const stats: HandoffStats = {
    routedIssues: byIssue.size,
    preparedOnly: latest.filter((row) => row.state === 'prepared').length,
    submittedIssues: [...byIssue.values()].filter((rows) => rows.some((row) => row.state === 'submitted')).length,
    acknowledgedIssues: [...byIssue.values()].filter((rows) => rows.some((row) => row.state === 'acknowledged')).length,
    overdueFollowUps: latest.filter((row) => row.state !== 'closed'
      && Boolean(row.followUpDueAt)
      && Date.parse(row.followUpDueAt!) < nowMs).length,
    closedHandoffs: latest.filter((row) => row.state === 'closed').length,
    totalEvents: events.length,
  };
  return {
    integrity: true,
    stats,
    recent: [...events]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.seq - a.seq)
      .slice(0, Math.max(0, Math.min(limit, 20))),
  };
}

export async function addVerification(record: VerificationRecord, issuePatch: Partial<CivicIssue>) {
  await mutateReadModel((model) => {
    const exists = model.verifications.some(
      (row) => row.issueId === record.issueId && row.verifierPubkey === record.verifierPubkey
    );
    if (!exists) model.verifications.push(record);
    model.issues = model.issues.map((issue) =>
      issue.issueId === record.issueId
        ? {
            ...issue,
            ...issuePatch,
            proof: { ...issue.proof, ...(issuePatch.proof ?? {}) },
          }
        : issue
    );
  });
}

export async function addStatusUpdate(input: {
  issueId: number;
  entry: StatusTimelineEntry;
  record: StatusUpdateRecord;
  issuePatch: Partial<CivicIssue>;
}) {
  await mutateReadModel((model) => {
    model.statusUpdates = [
      ...model.statusUpdates.filter((row) => !(row.issueId === input.record.issueId && row.seq === input.record.seq)),
      input.record,
    ].sort((a, b) => a.issueId - b.issueId || a.seq - b.seq);
    model.issues = model.issues.map((issue) =>
      issue.issueId === input.issueId
        ? {
            ...issue,
            ...input.issuePatch,
            timeline: [...issue.timeline.filter((row) => row.seq !== input.entry.seq), input.entry].sort(
              (a, b) => a.seq - b.seq
            ),
            proof: { ...issue.proof, ...(input.issuePatch.proof ?? {}) },
          }
        : issue
    );
  });
}

export async function recordSession(session: SessionRecord) {
  await mutateReadModel((model) => {
    const index = model.sessions.findIndex(
      (row) => row.id === session.id || row.sessionPubkey === session.sessionPubkey
    );
    if (index === -1) model.sessions.push(session);
    else model.sessions[index] = { ...model.sessions[index], ...session, lastSeenAt: new Date().toISOString() };
  });
}

export async function recordSteward(steward: StewardRecord) {
  await mutateReadModel((model) => {
    const index = model.stewards.findIndex((row) => row.walletPubkey === steward.walletPubkey);
    if (index === -1) model.stewards.push(steward);
    else model.stewards[index] = { ...model.stewards[index], ...steward };
  });
}

export function daysIgnored(issue: CivicIssue) {
  const end = isClosedStatus(issue.status)
    ? issue.timeline.at(-1)?.createdAt ?? new Date().toISOString()
    : new Date().toISOString();
  return Math.max(0, Math.floor((Date.parse(end) - Date.parse(issue.firstObservedAt)) / 86_400_000));
}

export async function dashboardStats(): Promise<DashboardStats> {
  const issues = await listIssues({ scope: 'public' });
  const totalIssues = issues.length;
  const unresolved = issues.filter((issue) => !isClosedStatus(issue.status));
  const verifiedIssues = issues.filter((issue) => issue.status === 'verified').length;
  const resolvedIssues = issues.filter((issue) => issue.status === 'resolved').length;
  const averageDaysIgnored = unresolved.length
    ? Math.round(unresolved.reduce((sum, issue) => sum + daysIgnored(issue), 0) / unresolved.length)
    : 0;
  return {
    totalIssues,
    unresolvedIssues: unresolved.length,
    verifiedIssues,
    resolvedIssues,
    averageDaysIgnored,
  };
}

export async function wardLeaderboard() {
  const grouped = new Map<
    string,
    { locality: string; total: number; unresolved: number; days: number; mostIgnored: CivicIssue | null }
  >();
  for (const issue of await listIssues({ scope: 'public' })) {
    const current = grouped.get(issue.wardId) ?? {
      locality: issue.locality,
      total: 0,
      unresolved: 0,
      days: 0,
      mostIgnored: null,
    };
    current.total += 1;
    const ignored = daysIgnored(issue);
    if (!isClosedStatus(issue.status)) {
      current.unresolved += 1;
      current.days += ignored;
      if (!current.mostIgnored || ignored > daysIgnored(current.mostIgnored)) current.mostIgnored = issue;
    }
    grouped.set(issue.wardId, current);
  }
  return Array.from(grouped.entries())
    .map(([wardId, row]) => ({
      wardId,
      locality: row.locality,
      total: row.total,
      unresolved: row.unresolved,
      averageDaysIgnored: row.unresolved ? Math.round(row.days / row.unresolved) : 0,
      mostIgnoredIssue: row.mostIgnored
        ? {
            id: row.mostIgnored.id,
            issueId: row.mostIgnored.issueId,
            title: row.mostIgnored.title,
            daysIgnored: daysIgnored(row.mostIgnored),
          }
        : null,
    }))
    .sort((a, b) => b.averageDaysIgnored - a.averageDaysIgnored || b.unresolved - a.unresolved);
}

export async function categoryBreakdown() {
  const grouped = new Map<IssueCategory, { category: IssueCategory; total: number; unresolved: number }>();
  for (const issue of await listIssues({ scope: 'public' })) {
    const current = grouped.get(issue.category) ?? { category: issue.category, total: 0, unresolved: 0 };
    current.total += 1;
    if (!isClosedStatus(issue.status)) current.unresolved += 1;
    grouped.set(issue.category, current);
  }
  return Array.from(grouped.values()).sort((a, b) => b.total - a.total);
}

export async function mostIgnoredIssues(limit = 5) {
  return (await listIssues({ scope: 'public', sort: 'most_ignored', limit }))
    .filter((issue) => !isClosedStatus(issue.status))
    .map((issue) => ({ ...issue, daysIgnored: daysIgnored(issue) }));
}

export async function recentResolvedIssues(limit = 5) {
  return (await listIssues({ scope: 'public' }))
    .filter((issue) => issue.status === 'resolved')
    .sort(
      (a, b) =>
        Date.parse(b.timeline.at(-1)?.createdAt ?? b.firstObservedAt) -
        Date.parse(a.timeline.at(-1)?.createdAt ?? a.firstObservedAt)
    )
    .slice(0, limit);
}

export async function latestIndexedIssue() {
  return (
    (await listIssues({ scope: 'public' }))
      .filter((issue) => issue.proof.proofStatus !== 'seeded_demo')
      .sort((a, b) => b.issueId - a.issueId)[0] ?? null
  );
}

export async function applyChainIssue(input: {
  issueId: number;
  status: IssueStatus;
  verificationCount: number;
  updateCount: number;
  timelineHash: string;
  resolutionHash: string;
  latestTxSig?: string | null;
}) {
  return mutateReadModel((model) => {
    const issue = model.issues.find((row) => row.issueId === input.issueId);
    if (!issue) return null;
    const updated: CivicIssue = {
      ...issue,
      status: input.status,
      verificationCount: input.verificationCount,
      updateCount: input.updateCount,
      resolutionHash:
        input.resolutionHash === '0000000000000000000000000000000000000000000000000000000000000000'
          ? issue.resolutionHash
          : input.resolutionHash,
      proof: {
        ...issue.proof,
        timelineHash: input.timelineHash,
        latestTxSig: input.latestTxSig ?? issue.proof.latestTxSig,
        proofStatus: 'indexed_devnet',
        explorerUrl: explorerUrl(issue.proof.issuePda, 'address'),
      },
    };
    const index = model.issues.findIndex((row) => row.issueId === input.issueId);
    model.issues[index] = updated;
    return updated;
  });
}

export async function recordRequestEvent(input: {
  scope: string;
  identifier: string;
  outcome: RequestEventOutcome;
  now?: Date | string | number;
  metadata?: RequestEventMetadata;
}) {
  const scope = sanitizeScope(input.scope);
  const identifierHash = hashIdentifier(scope, sanitizeIdentifier(input.identifier));
  const nowMs = timestampMs(input.now);
  const event: RequestEventRecord = {
    id: randomUUID(),
    scope,
    identifierHash,
    outcome: input.outcome,
    createdAt: new Date(nowMs).toISOString(),
    metadata: sanitizeMetadata(input.metadata),
  };

  await mutateReadModel((model) => {
    pruneRequestState(model, nowMs, requestEventRetentionMs());
    appendRequestEvent(model, event);
  });
  return event;
}

export async function consumeRateLimit(input: RateLimitInput): Promise<RateLimitDecision> {
  const scope = sanitizeScope(input.scope);
  const identifierHash = hashIdentifier(scope, sanitizeIdentifier(input.identifier));
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 10_000) {
    throw new Error('invalid_rate_limit_capacity');
  }
  if (!Number.isInteger(input.windowMs) || input.windowMs < 1_000 || input.windowMs > 30 * 24 * 60 * 60 * 1_000) {
    throw new Error('invalid_rate_limit_window');
  }

  const nowMs = timestampMs(input.now);
  const nowIso = new Date(nowMs).toISOString();
  return mutateReadModel((model) => {
    pruneRequestState(model, nowMs, requestEventRetentionMs(input.windowMs * 2));
    const buckets = model.rateLimits ?? [];
    let bucket = buckets.find((row) => row.scope === scope && row.identifierHash === identifierHash);

    if (!bucket || bucket.capacity !== input.limit || bucket.windowMs !== input.windowMs) {
      bucket = {
        scope,
        identifierHash,
        capacity: input.limit,
        windowMs: input.windowMs,
        tokens: input.limit,
        lastRefillAt: nowIso,
        updatedAt: nowIso,
      };
      model.rateLimits = [
        ...buckets.filter((row) => !(row.scope === scope && row.identifierHash === identifierHash)),
        bucket,
      ];
    }

    const lastRefillMs = validTimestamp(bucket.lastRefillAt) ? Date.parse(bucket.lastRefillAt) : nowMs;
    const elapsedMs = Math.max(0, nowMs - lastRefillMs);
    const refillPerMs = input.limit / input.windowMs;
    bucket.tokens = Math.min(input.limit, Math.max(0, bucket.tokens) + elapsedMs * refillPerMs);
    bucket.lastRefillAt = nowIso;
    bucket.updatedAt = nowIso;

    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;

    appendRequestEvent(model, {
      id: randomUUID(),
      scope,
      identifierHash,
      outcome: allowed ? 'allowed' : 'blocked',
      createdAt: nowIso,
      metadata: sanitizeMetadata(input.metadata),
    });

    const retryMs = allowed ? 0 : Math.max(0, (1 - bucket.tokens) / refillPerMs);
    const fullRefillMs = Math.max(0, (input.limit - bucket.tokens) / refillPerMs);
    return {
      allowed,
      limit: input.limit,
      remaining: Math.max(0, Math.floor(bucket.tokens)),
      resetAt: new Date(nowMs + (allowed ? fullRefillMs : retryMs)).toISOString(),
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil(retryMs / 1_000)),
    };
  });
}

export async function pruneRequestEvents(input: { now?: Date | string | number; retentionMs?: number } = {}) {
  const nowMs = timestampMs(input.now);
  const retentionMs = Math.max(input.retentionMs ?? requestEventRetentionMs(), 60_000);
  return mutateReadModel((model) => {
    const before = model.requestEvents?.length ?? 0;
    pruneRequestState(model, nowMs, retentionMs);
    return before - (model.requestEvents?.length ?? 0);
  });
}

export async function listRequestEvents(
  filters: { scope?: string; identifier?: string; since?: Date | string | number; limit?: number } = {}
) {
  const scope = filters.scope ? sanitizeScope(filters.scope) : null;
  const identifierHash =
    scope && filters.identifier ? hashIdentifier(scope, sanitizeIdentifier(filters.identifier)) : null;
  const sinceMs = filters.since === undefined ? null : timestampMs(filters.since);
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 1_000);
  return ((await readModel()).requestEvents ?? [])
    .filter((event) => !scope || event.scope === scope)
    .filter((event) => !identifierHash || event.identifierHash === identifierHash)
    .filter((event) => sinceMs === null || Date.parse(event.createdAt) >= sinceMs)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}
