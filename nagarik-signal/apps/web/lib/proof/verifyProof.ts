import type { CivicIssue } from '../types';
import { fetchIssueOnChain } from '../solana/readOnly';
import { explorerUrl } from '../solana/explorer';
import { buildIssueProofMetadata } from './metadata';
import { sha256Hex } from './hash';
import { canonicalize } from './canonicalize';

const ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export function proofMetadata(issue: CivicIssue) {
  return buildIssueProofMetadata(issue);
}

function normalizeResolutionHash(value: string | null | undefined) {
  if (!value || value === ZERO_HASH) return null;
  return value;
}

export async function verifyIssueProof(issue: CivicIssue) {
  const computedMetadataHash = await sha256Hex(canonicalize(proofMetadata(issue)));
  const localMetadataMatches = computedMetadataHash === issue.proof.metadataHash;

  if (issue.proof.proofStatus === 'seeded_demo') {
    return {
      ok: localMetadataMatches,
      matches: localMetadataMatches,
      mode: 'seeded_demo',
      issueId: issue.id,
      issuePda: issue.proof.issuePda,
      onChain: null,
      computed: {
        metadataHash: computedMetadataHash,
        evidenceHash: issue.proof.evidenceHash,
        locationHash: issue.proof.locationHash,
        timelineHash: issue.proof.timelineHash,
        resolutionHash: issue.resolutionHash,
      },
      stored: {
        metadataHash: issue.proof.metadataHash,
        evidenceHash: issue.proof.evidenceHash,
        locationHash: issue.proof.locationHash,
        timelineHash: issue.proof.timelineHash,
        resolutionHash: issue.resolutionHash,
      },
      explorerUrl: null,
      metadataMatches: localMetadataMatches,
      evidenceMatches: true,
      locationMatches: true,
      timelineMatches: true,
      resolutionMatches: true,
      statusMatches: true,
      countMatches: true,
      boundary: 'Sample records do not claim live Solana proof.',
    };
  }

  const onChain = await fetchIssueOnChain(issue.issueId);
  const metadataMatches = computedMetadataHash === onChain.metadataHash && issue.proof.metadataHash === onChain.metadataHash;
  const evidenceMatches = issue.proof.evidenceHash === onChain.evidenceHash;
  const locationMatches = issue.proof.locationHash === onChain.locationHash;
  const timelineMatches = issue.proof.timelineHash === onChain.timelineHash;
  const resolutionMatches = normalizeResolutionHash(issue.resolutionHash) === normalizeResolutionHash(onChain.resolutionHash);
  const statusMatches = issue.status === onChain.status;
  const countMatches = issue.verificationCount === onChain.verificationCount && issue.updateCount === onChain.updateCount;
  const matches = metadataMatches && evidenceMatches && locationMatches && timelineMatches && resolutionMatches && statusMatches && countMatches;

  return {
    ok: matches,
    matches,
    mode: matches ? 'verified_devnet' : 'mismatch',
    issueId: issue.id,
    issuePda: issue.proof.issuePda,
    onChain: {
      metadataHash: onChain.metadataHash,
      evidenceHash: onChain.evidenceHash,
      locationHash: onChain.locationHash,
      status: onChain.status,
      verificationCount: onChain.verificationCount,
      updateCount: onChain.updateCount,
      timelineHash: onChain.timelineHash,
      resolutionHash: onChain.resolutionHash,
      proofAnchoredAt: onChain.proofAnchoredAt,
    },
    computed: {
      metadataHash: computedMetadataHash,
      evidenceHash: issue.proof.evidenceHash,
      locationHash: issue.proof.locationHash,
      timelineHash: issue.proof.timelineHash,
      resolutionHash: normalizeResolutionHash(issue.resolutionHash),
    },
    stored: {
      metadataHash: issue.proof.metadataHash,
      evidenceHash: issue.proof.evidenceHash,
      locationHash: issue.proof.locationHash,
      timelineHash: issue.proof.timelineHash,
      resolutionHash: normalizeResolutionHash(issue.resolutionHash),
    },
    explorerUrl: explorerUrl(onChain.issuePda, 'address'),
    metadataMatches,
    evidenceMatches,
    locationMatches,
    timelineMatches,
    resolutionMatches,
    statusMatches,
    countMatches,
  };
}
