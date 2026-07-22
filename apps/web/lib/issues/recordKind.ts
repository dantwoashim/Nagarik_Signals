import type { CivicIssue, RecordKind } from '../types';

export function inferredRecordKind(issue: Pick<CivicIssue, 'recordKind' | 'proof'>): RecordKind {
  if (issue.recordKind) return issue.recordKind;
  return issue.proof.proofStatus === 'seeded_demo' ? 'illustrative_sample' : 'qa_fixture';
}

export function recordKindLabel(issue: Pick<CivicIssue, 'recordKind' | 'proof'>) {
  const kind = inferredRecordKind(issue);
  if (kind === 'community_report') return 'Community report';
  if (kind === 'public_source') return 'Public-source dossier';
  if (kind === 'illustrative_sample') return 'Illustrative sample';
  return 'Technical test record';
}

export function isCivicRecord(issue: Pick<CivicIssue, 'recordKind' | 'proof'>) {
  const kind = inferredRecordKind(issue);
  return kind === 'community_report' || kind === 'public_source';
}

export function sourceFreshness(issue: Pick<CivicIssue, 'provenance'>, now = Date.now()) {
  if (!issue.provenance) return null;
  if (!issue.provenance.expiresAt) return 'no_expiry' as const;
  return Date.parse(issue.provenance.expiresAt) < now ? 'recheck_due' as const : 'within_review_window' as const;
}
