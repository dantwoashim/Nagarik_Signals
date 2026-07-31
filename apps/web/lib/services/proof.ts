import { createHash } from 'node:crypto';

import type { PublicIssueProjection, PublicIssueProof } from '../db/repositories/publicIssues';
import { canonicalize } from '../proof/canonicalize';
import { verifyDeliveredEvidence } from '../proof/evidence';

function bytesHex(value: Uint8Array): string {
  return Buffer.from(value).toString('hex');
}

function hash(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}

export async function buildPublicProofResponse(input: {
  issue: PublicIssueProjection;
  proof: PublicIssueProof;
  appOrigin: string;
}) {
  const metadataExpected = bytesHex(input.proof.metadata_hash);
  const metadataComputed = hash(input.proof.canonical_metadata);
  const locationExpected = bytesHex(input.proof.location_hash);
  const locationComputed = input.issue.location ? hash(input.issue.location) : null;
  const evidenceExpected = bytesHex(input.proof.evidence_hash);
  const mediaPath = input.issue.media_id ? `/api/media/med_${input.issue.media_id}` : null;
  const evidence =
    mediaPath && input.issue.publication_state !== 'removed'
      ? await verifyDeliveredEvidence(mediaPath, evidenceExpected, {
          appOrigin: input.appOrigin,
          maxBytes: 6 * 1024 * 1024,
        })
      : {
          status: 'unavailable' as const,
          available: false,
          expectedHash: evidenceExpected,
          computedHash: null,
          byteLength: null,
          mediaType: null,
          error: 'public_media_unavailable',
        };

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
        status: 'finalized_binding_recorded',
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
