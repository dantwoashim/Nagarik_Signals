import type { CivicIssue, IssueCategory, ProofMetadata } from '../types';
import { coarseGeohash, roundedLocation } from '../geo/geohash';
import { canonicalize } from './canonicalize';
import { sha256Hex } from './hash';

export type ProofMetadataInput = {
  title: string;
  description: string;
  category: IssueCategory;
  wardId: string;
  locality: string;
  latDisplay: number;
  lngDisplay: number;
  geohash?: string | null;
  firstObservedAt: string;
  evidenceHash: string;
  photoUrl: string;
};

export function buildProofMetadata(input: ProofMetadataInput): ProofMetadata {
  return {
    version: '1.0',
    title: input.title,
    description: input.description,
    category: input.category,
    wardId: input.wardId,
    locality: input.locality,
    approxLocation: roundedLocation(input.latDisplay, input.lngDisplay),
    geohashPrecision: 6,
    firstObservedAt: new Date(input.firstObservedAt).toISOString(),
    photoHash: input.evidenceHash,
    photoUrl: input.photoUrl,
    safetyDeclaration: true,
  };
}

export function buildIssueProofMetadata(issue: CivicIssue) {
  return buildProofMetadata({
    title: issue.title,
    description: issue.description,
    category: issue.category,
    wardId: issue.wardId,
    locality: issue.locality,
    latDisplay: issue.latDisplay,
    lngDisplay: issue.lngDisplay,
    geohash: issue.geohash,
    firstObservedAt: issue.firstObservedAt,
    evidenceHash: issue.proof.evidenceHash,
    photoUrl: issue.photoUrl,
  });
}

export async function computeMetadataHash(metadata: ProofMetadata) {
  return sha256Hex(canonicalize(metadata));
}

export function normalizeGeohash(latDisplay: number, lngDisplay: number, geohash?: string | null) {
  return geohash?.trim() || coarseGeohash(latDisplay, lngDisplay);
}

export async function computeLocationHash(wardId: string, geohash: string) {
  return sha256Hex(`${wardId}:${geohash}:v1`);
}
