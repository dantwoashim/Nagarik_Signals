import 'server-only';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CivicIssue, DashboardStats, IssueCategory, IssueStatus, StatusTimelineEntry } from '../types';
import { isClosedStatus } from '../constants/statuses';
import { readModelPath } from '../server/paths';
import { explorerUrl } from '../solana/explorer';
import { createSeededDemoReadModel } from './demoSeed';

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

export type ReadModel = {
  version: 1;
  storage: 'local_json';
  updatedAt: string;
  issues: CivicIssue[];
  verifications: VerificationRecord[];
  statusUpdates: StatusUpdateRecord[];
  sessions: SessionRecord[];
  stewards: StewardRecord[];
};

export type IssueListFilters = {
  ward?: string | null;
  category?: string | null;
  status?: string | null;
  sort?: string | null;
  limit?: number | null;
  cursor?: number | null;
};

function initialModel(): ReadModel {
  return createSeededDemoReadModel();
}

export function readModelExists() {
  return existsSync(readModelPath());
}

export function readModel(): ReadModel {
  const path = readModelPath();
  if (!existsSync(path)) {
    const model = initialModel();
    writeModel(model);
    return model;
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as ReadModel;
  return {
    ...initialModel(),
    ...raw,
    issues: raw.issues ?? [],
    verifications: raw.verifications ?? [],
    statusUpdates: raw.statusUpdates ?? [],
    sessions: raw.sessions ?? [],
    stewards: raw.stewards ?? [],
  };
}

export function writeModel(model: ReadModel) {
  const path = readModelPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ ...model, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
}

export function listIssues(filters: IssueListFilters = {}) {
  let rows = readModel().issues.filter((issue) => issue.safetyReviewStatus === 'visible');
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

export function getIssue(id: string | number) {
  const key = String(id);
  return readModel().issues.find((issue) => issue.id === key || String(issue.issueId) === key) ?? null;
}

export function listVerifications(issueId?: number) {
  const rows = readModel().verifications;
  return typeof issueId === 'number' ? rows.filter((row) => row.issueId === issueId) : rows;
}

export function findVerification(issueId: number, verifierPubkey: string) {
  return readModel().verifications.find((row) => row.issueId === issueId && row.verifierPubkey === verifierPubkey) ?? null;
}

export function upsertIssue(issue: CivicIssue) {
  const model = readModel();
  const index = model.issues.findIndex((row) => row.issueId === issue.issueId || row.id === issue.id);
  if (index === -1) model.issues.push(issue);
  else model.issues[index] = issue;
  writeModel(model);
}

export function addVerification(record: VerificationRecord, issuePatch: Partial<CivicIssue>) {
  const model = readModel();
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
  writeModel(model);
}

export function addStatusUpdate(input: {
  issueId: number;
  entry: StatusTimelineEntry;
  record: StatusUpdateRecord;
  issuePatch: Partial<CivicIssue>;
}) {
  const model = readModel();
  model.statusUpdates = [
    ...model.statusUpdates.filter((row) => !(row.issueId === input.record.issueId && row.seq === input.record.seq)),
    input.record,
  ].sort((a, b) => a.issueId - b.issueId || a.seq - b.seq);
  model.issues = model.issues.map((issue) =>
    issue.issueId === input.issueId
      ? {
          ...issue,
          ...input.issuePatch,
          timeline: [...issue.timeline.filter((row) => row.seq !== input.entry.seq), input.entry].sort((a, b) => a.seq - b.seq),
          proof: { ...issue.proof, ...(input.issuePatch.proof ?? {}) },
        }
      : issue
  );
  writeModel(model);
}

export function recordSession(session: SessionRecord) {
  const model = readModel();
  const index = model.sessions.findIndex((row) => row.id === session.id || row.sessionPubkey === session.sessionPubkey);
  if (index === -1) model.sessions.push(session);
  else model.sessions[index] = { ...model.sessions[index], ...session, lastSeenAt: new Date().toISOString() };
  writeModel(model);
}

export function recordSteward(steward: StewardRecord) {
  const model = readModel();
  const index = model.stewards.findIndex((row) => row.walletPubkey === steward.walletPubkey);
  if (index === -1) model.stewards.push(steward);
  else model.stewards[index] = { ...model.stewards[index], ...steward };
  writeModel(model);
}

export function daysIgnored(issue: CivicIssue) {
  const end = isClosedStatus(issue.status) ? issue.timeline.at(-1)?.createdAt ?? new Date().toISOString() : new Date().toISOString();
  return Math.max(0, Math.floor((Date.parse(end) - Date.parse(issue.firstObservedAt)) / 86_400_000));
}

export function dashboardStats(): DashboardStats {
  const issues = listIssues();
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

export function wardLeaderboard() {
  const grouped = new Map<string, { locality: string; total: number; unresolved: number; days: number; mostIgnored: CivicIssue | null }>();
  for (const issue of listIssues()) {
    const current = grouped.get(issue.wardId) ?? { locality: issue.locality, total: 0, unresolved: 0, days: 0, mostIgnored: null };
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
        ? { id: row.mostIgnored.id, issueId: row.mostIgnored.issueId, title: row.mostIgnored.title, daysIgnored: daysIgnored(row.mostIgnored) }
        : null,
    }))
    .sort((a, b) => b.averageDaysIgnored - a.averageDaysIgnored || b.unresolved - a.unresolved);
}

export function categoryBreakdown() {
  const grouped = new Map<IssueCategory, { category: IssueCategory; total: number; unresolved: number }>();
  for (const issue of listIssues()) {
    const current = grouped.get(issue.category) ?? { category: issue.category, total: 0, unresolved: 0 };
    current.total += 1;
    if (!isClosedStatus(issue.status)) current.unresolved += 1;
    grouped.set(issue.category, current);
  }
  return Array.from(grouped.values()).sort((a, b) => b.total - a.total);
}

export function mostIgnoredIssues(limit = 5) {
  return listIssues({ sort: 'most_ignored', limit })
    .filter((issue) => !isClosedStatus(issue.status))
    .map((issue) => ({ ...issue, daysIgnored: daysIgnored(issue) }));
}

export function recentResolvedIssues(limit = 5) {
  return listIssues()
    .filter((issue) => issue.status === 'resolved')
    .sort((a, b) => Date.parse(b.timeline.at(-1)?.createdAt ?? b.firstObservedAt) - Date.parse(a.timeline.at(-1)?.createdAt ?? a.firstObservedAt))
    .slice(0, limit);
}

export function latestIndexedIssue() {
  return listIssues()
    .filter((issue) => issue.proof.proofStatus !== 'seeded_demo')
    .sort((a, b) => b.issueId - a.issueId)[0] ?? null;
}

export function applyChainIssue(input: {
  issueId: number;
  status: IssueStatus;
  verificationCount: number;
  updateCount: number;
  timelineHash: string;
  resolutionHash: string;
  latestTxSig?: string | null;
}) {
  const issue = getIssue(input.issueId);
  if (!issue) return null;
  const updated: CivicIssue = {
    ...issue,
    status: input.status,
    verificationCount: input.verificationCount,
    updateCount: input.updateCount,
    resolutionHash: input.resolutionHash === '0000000000000000000000000000000000000000000000000000000000000000' ? issue.resolutionHash : input.resolutionHash,
    proof: {
      ...issue.proof,
      timelineHash: input.timelineHash,
      latestTxSig: input.latestTxSig ?? issue.proof.latestTxSig,
      proofStatus: 'indexed_devnet',
      explorerUrl: explorerUrl(issue.proof.issuePda, 'address'),
    },
  };
  upsertIssue(updated);
  return updated;
}
