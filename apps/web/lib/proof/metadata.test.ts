import assert from 'node:assert/strict';
import test from 'node:test';
import type { IssueProvenance } from '../types';
import { buildProofMetadata, computeMetadataHash } from './metadata';

const provenance: IssueProvenance = {
  publisher: 'Kathmandu Metropolitan City - Metro News',
  sourceTitle: 'Drainage response update',
  sourceUrl: 'https://example.gov.np/drainage-update',
  corroboratingUrls: [],
  sourceType: 'official',
  publishedAt: '2026-07-05T00:00:00.000+05:45',
  checkedAt: '2026-07-14T12:00:00.000+05:45',
  expiresAt: '2026-07-28T12:00:00.000+05:45',
  confidence: 'high',
  statusAtCheck: 'needs_recheck',
  escalationUrl: 'https://gunaso.kathmandu.gov.np/register',
};

const base = {
  title: 'Drainage capacity remains a follow-up issue',
  description: 'An official publication documented drainage work and the current condition requires a dated recheck.',
  category: 'water' as const,
  wardId: 'kathmandu-03',
  locality: 'Kathmandu Ward 3',
  latDisplay: 27.72,
  lngDisplay: 85.31,
  firstObservedAt: '2026-07-05T00:00:00.000+05:45',
  evidenceHash: 'a'.repeat(64),
  photoUrl: '/source-dossiers/drainage.png',
};

test('public-source metadata commits record origin and review dates', async () => {
  const metadata = buildProofMetadata({
    ...base,
    recordKind: 'public_source',
    provenance,
  });
  assert.equal(metadata.version, '1.1');
  if (metadata.version !== '1.1') throw new Error('unexpected_metadata_version');
  assert.equal(metadata.recordKind, 'public_source');
  assert.equal(metadata.provenance?.publisher, provenance.publisher);
  assert.equal(metadata.provenance?.checkedAt, provenance.checkedAt);
  assert.equal(metadata.provenance?.expiresAt, provenance.expiresAt);

  const changedReview = buildProofMetadata({
    ...base,
    recordKind: 'public_source',
    provenance: { ...provenance, checkedAt: '2026-07-15T12:00:00.000+05:45' },
  });
  assert.notEqual(await computeMetadataHash(metadata), await computeMetadataHash(changedReview));
});

test('community metadata uses the same version without inventing provenance', () => {
  const metadata = buildProofMetadata({
    ...base,
    recordKind: 'community_report',
    provenance: null,
  });
  assert.equal(metadata.version, '1.1');
  if (metadata.version !== '1.1') throw new Error('unexpected_metadata_version');
  assert.equal(metadata.recordKind, 'community_report');
  assert.equal(metadata.provenance, null);
});
