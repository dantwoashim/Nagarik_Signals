import { createHash } from 'node:crypto';

import type { PublicIssueProjection, PublicIssueProof } from '../db/repositories/publicIssues';
import { canonicalize } from '../proof/canonicalize';
import { verifyDeliveredEvidence } from '../proof/evidence';
import { publicMediaPath } from '../public/mediaPath';
import { verifyV2PublicProof } from '../solana/v2/readOnly';

function bytesHex(value: Uint8Array): string {
  return Buffer.from(value).toString('hex');
}

function hash(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}

function legacyLocationHash(issue: PublicIssueProjection): string | null {
  if (!issue.location || typeof issue.location !== 'object' || Array.isArray(issue.location)) return null;
  if (!issue.ward || typeof issue.ward !== 'object' || Array.isArray(issue.ward)) return null;
  const geohash = (issue.location as Record<string, unknown>).legacyGeohash;
  const wardId = (issue.ward as Record<string, unknown>).id;
  if (typeof geohash !== 'string' || typeof wardId !== 'string') return null;
  return createHash('sha256').update(`${wardId}:${geohash}:v1`).digest('hex');
}

export async function buildPublicProofResponse(input: {
  issue: PublicIssueProjection;
  proof: PublicIssueProof;
  appOrigin: string;
}) {
  const metadataExpected = bytesHex(input.proof.metadata_hash);
  const metadataComputed = hash(input.proof.canonical_metadata);
  const locationExpected = bytesHex(input.proof.location_hash);
  const locationComputed = input.proof.protocol_version === 'v1_legacy'
    ? legacyLocationHash(input.issue)
    : input.issue.location
      ? hash(input.issue.location)
      : null;
  const evidenceExpected = bytesHex(input.proof.evidence_hash);
  const mediaPath = publicMediaPath(input.issue);
  const [evidence, chainVerification] = await Promise.all([
    mediaPath && input.issue.publication_state !== 'removed'
      ? verifyDeliveredEvidence(mediaPath, evidenceExpected, {
          appOrigin: input.appOrigin,
          maxBytes: 6 * 1024 * 1024,
        })
      : Promise.resolve({
          status: 'unavailable' as const,
          available: false,
          expectedHash: evidenceExpected,
          computedHash: null,
          byteLength: null,
          mediaType: null,
          error: 'public_media_unavailable',
        }),
    input.proof.protocol_version === 'v2'
      ? verifyV2PublicProof({
          publicId: input.issue.public_id,
          genesisHash: input.proof.genesis_hash,
          programId: input.proof.program_id,
          issueAccount: input.proof.issue_account,
          eventAccount: input.proof.event_account,
          signature: input.proof.signature,
          finalizedSlot: Number(input.proof.finalized_slot),
          updateCount: Number(input.proof.update_count),
          metadataHash: metadataExpected,
          evidenceHash: evidenceExpected,
          locationHash: locationExpected,
          timelineHead: bytesHex(input.proof.timeline_head),
          handoffHead: bytesHex(input.proof.handoff_head),
          publicationRemoved: input.issue.publication_state === 'removed',
        })
      : Promise.resolve(null),
  ]);

  return {
    schemaVersion: 'nagarik-proof-response-v2',
    publicId: input.issue.public_id,
    protocolVersion: input.proof.protocol_version,
    checkedAt: new Date().toISOString(),
    checks: {
      metadata: {
        status: metadataComputed === metadataExpected ? 'match' : 'mismatch',
        expectedHash: metadataExpected,
        computedHash: metadataComputed,
      },
      evidence: {
        status: evidence.status,
        available: evidence.available,
        expectedHash: evidence.expectedHash,
        computedHash: evidence.computedHash,
        byteLength: evidence.byteLength,
        mediaType: evidence.mediaType,
        error: evidence.error,
      },
      location: {
        status:
          locationComputed === null
            ? 'not_available_after_removal'
            : locationComputed === locationExpected
              ? 'match'
              : 'mismatch',
        expectedHash: locationExpected,
        computedHash: locationComputed,
      },
      chain: {
        status: chainVerification?.status ?? 'finalized_binding_recorded',
        cluster: input.proof.cluster,
        genesisHash: input.proof.genesis_hash,
        programId: input.proof.program_id,
        issueAccount: input.proof.issue_account,
        eventAccount: input.proof.event_account,
        signature: input.proof.signature,
        finalizedSlot: Number(input.proof.finalized_slot),
        updateCount: Number(input.proof.update_count),
        timelineHead: bytesHex(input.proof.timeline_head),
        handoffHead: bytesHex(input.proof.handoff_head),
        issueAccountOwner: chainVerification?.owner ?? null,
        issueAccountSha256: chainVerification?.issueAccountSha256 ?? null,
        eventAccountSha256: chainVerification?.eventAccountSha256 ?? null,
        publicationRemoved: chainVerification?.observedPublicationRemoved ?? null,
        confirmationQuorum: {
          requiredIndependentProviders: chainVerification?.requiredIndependentProviders ?? 0,
          agreedIndependentProviders: chainVerification?.agreedIndependentProviders ?? 0,
          minimumFinalizedSlot: chainVerification?.minimumFinalizedSlot ?? null,
        },
        confirmedAt: input.proof.confirmed_at.toISOString(),
      },
      availability: {
        issue: input.issue.publication_state === 'removed' ? 'tombstone' : 'available',
        media: evidence.available ? 'available' : 'unavailable',
      },
    },
    canonicalMetadata: input.proof.canonical_metadata,
    boundary: {
      integrity: 'Commitments can reveal whether public bytes or metadata changed.',
      truth: 'A matching commitment does not prove that a civic claim is true.',
      signals: 'Public signals represent attention, not verified people or official action.',
    },
  };
}
