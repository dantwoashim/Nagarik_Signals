import type { CivicIssue } from '../types';
import { fetchIssueOnChain } from '../solana/readOnly';
import { explorerUrl } from '../solana/explorer';
import { buildIssueProofMetadata } from './metadata';
import { sha256Hex } from './hash';
import { canonicalize } from './canonicalize';
import { verifyDeliveredEvidence } from './evidence';

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
  const deliveredEvidence = await verifyDeliveredEvidence(issue.photoUrl, issue.proof.evidenceHash);
  const deliveredEvidenceMatches = deliveredEvidence.status === 'match';

  if (issue.proof.proofStatus === 'seeded_demo') {
    const matches = localMetadataMatches && deliveredEvidenceMatches;
    const mode = !localMetadataMatches
      ? 'mismatch'
      : deliveredEvidence.status === 'unavailable'
        ? 'evidence_unavailable'
        : matches
          ? 'seeded_demo'
          : 'mismatch';
    return {
      ok: matches,
      matches,
      mode,
      error: deliveredEvidence.status === 'unavailable' ? deliveredEvidence.error : undefined,
      issueId: issue.id,
      issuePda: issue.proof.issuePda,
      onChain: null,
      computed: {
        metadataHash: computedMetadataHash,
        evidenceHash: deliveredEvidence.computedHash,
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
      evidenceMatches: deliveredEvidenceMatches,
      evidenceStatus: deliveredEvidence.status,
      evidenceAvailable: deliveredEvidence.available,
      evidenceError: deliveredEvidence.error,
      evidenceByteLength: deliveredEvidence.byteLength,
      storedEvidenceMatchesOnChain: null,
      locationMatches: true,
      timelineMatches: true,
      resolutionMatches: true,
      statusMatches: true,
      countMatches: true,
      boundary: deliveredEvidence.status === 'unavailable'
        ? 'Sample metadata is local-only and its delivered evidence is unavailable.'
        : 'Sample records do not claim live Solana proof.',
    };
  }

  const onChain = await fetchIssueOnChain(issue.issueId);
  const metadataMatches = computedMetadataHash === onChain.metadataHash && issue.proof.metadataHash === onChain.metadataHash;
  const storedEvidenceMatchesOnChain = issue.proof.evidenceHash === onChain.evidenceHash;
  const evidenceMatches = deliveredEvidenceMatches && storedEvidenceMatchesOnChain;
  const locationMatches = issue.proof.locationHash === onChain.locationHash;
  const timelineMatches = issue.proof.timelineHash === onChain.timelineHash;
  const resolutionMatches = normalizeResolutionHash(issue.resolutionHash) === normalizeResolutionHash(onChain.resolutionHash);
  const statusMatches = issue.status === onChain.status;
  const countMatches = issue.verificationCount === onChain.verificationCount && issue.updateCount === onChain.updateCount;
  const matches = metadataMatches && evidenceMatches && locationMatches && timelineMatches && resolutionMatches && statusMatches && countMatches;
  const nonEvidenceMatches = metadataMatches && locationMatches && timelineMatches && resolutionMatches && statusMatches && countMatches;

  const mode = !nonEvidenceMatches || !storedEvidenceMatchesOnChain
    ? 'mismatch'
    : deliveredEvidence.status === 'unavailable'
      ? 'evidence_unavailable'
      : matches
        ? 'verified_devnet'
        : 'mismatch';

  return {
    ok: matches,
    matches,
    mode,
    error: deliveredEvidence.status === 'unavailable' ? deliveredEvidence.error : undefined,
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
      evidenceHash: deliveredEvidence.computedHash,
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
    evidenceStatus: deliveredEvidence.status,
    evidenceAvailable: deliveredEvidence.available,
    evidenceError: deliveredEvidence.error,
    evidenceByteLength: deliveredEvidence.byteLength,
    storedEvidenceMatchesOnChain,
    locationMatches,
    timelineMatches,
    resolutionMatches,
    statusMatches,
    countMatches,
    boundary: deliveredEvidence.status === 'unavailable'
      ? 'On-chain fields were checked, but the delivered evidence bytes were unavailable.'
      : undefined,
  };
}
