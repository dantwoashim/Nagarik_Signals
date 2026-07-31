import { createHash } from 'node:crypto';

import { PublicKey } from '@solana/web3.js';

export const V2_PROGRAM_ID = new PublicKey('A1PDikCUQekCAbc8CHcZgEFwxxhEyspfHGEbG7PX4URP');
export const V2_GENESIS_AUTHORITY = new PublicKey('94GGj4zzhRQV5FzpL3RmYoZrH5qoLhdRMKYj9t9ndv5i');
export const V2_PROTOCOL_VERSION = 2;
export const V2_MAX_SEQUENCE = 9_007_199_254_740_991n;

export const v2AccountLengths = {
  protocolConfig: 140,
  roleGrant: 124,
  issueCommitment: 324,
  commitmentEvent: 332,
} as const;

export const v2Categories = {
  road: 0,
  waste: 1,
  water: 2,
  electricity_lighting: 3,
  public_facility: 4,
  public_safety_hazard: 5,
  other_public_infrastructure: 6,
} as const;

export const v2Lifecycles = {
  open: 0,
  in_progress: 1,
  resolved: 2,
  closed: 3,
  disputed: 4,
} as const;

export const v2Operations = {
  issue_created: 0,
  metadata_version_committed: 1,
  lifecycle_changed: 2,
  handoff_checkpointed: 3,
  publication_removed: 4,
} as const;

export const v2RoleBits = {
  issue_issuer: 0x0001,
  lifecycle_writer: 0x0002,
  handoff_writer: 0x0004,
  removal_writer: 0x0008,
} as const;

export type V2Operation = keyof typeof v2Operations;

const canonicalUuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function sha256(...parts: readonly Uint8Array[]): Buffer {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest();
}

function domain(value: string): Buffer {
  return Buffer.from(`${value}\0`, 'utf8');
}

function exact32(value: Uint8Array, label: string): Buffer {
  if (value.byteLength !== 32) throw new Error(`${label}_must_be_32_bytes`);
  return Buffer.from(value);
}

function discriminant(value: number, maximum: number, label: string): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${label}_invalid`);
  }
  return Buffer.from([value]);
}

export function uuidV4Bytes(value: string): Buffer {
  if (!canonicalUuidV4.test(value)) throw new Error('canonical_uuid_v4_required');
  return Buffer.from(value.replaceAll('-', ''), 'hex');
}

export function deriveIssueKey(publicIssueId: string): Buffer {
  return sha256(domain('nagarik:v2:issue'), uuidV4Bytes(publicIssueId));
}

export function deriveEventId(input: {
  issueKey: Uint8Array;
  eventId: string;
  operation: V2Operation;
}): Buffer {
  return sha256(
    domain('nagarik:v2:event'),
    exact32(input.issueKey, 'issue_key'),
    uuidV4Bytes(input.eventId),
    discriminant(v2Operations[input.operation], 4, 'event_type'),
  );
}

export function deriveOperationId(input: {
  issueKey: Uint8Array;
  eventId: Uint8Array;
  operation: V2Operation;
}): Buffer {
  return sha256(
    domain('nagarik:v2:operation'),
    exact32(input.issueKey, 'issue_key'),
    exact32(input.eventId, 'event_id'),
    discriminant(v2Operations[input.operation], 4, 'operation_type'),
  );
}

export function deriveProtocolPda(programId = V2_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('protocol'), Buffer.from('v2')], programId);
}

export function deriveRoleGrantPda(
  subject: PublicKey,
  programId = V2_PROGRAM_ID,
): [PublicKey, number] {
  const [protocol] = deriveProtocolPda(programId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('role'), protocol.toBuffer(), subject.toBuffer()],
    programId,
  );
}

export function deriveIssuePda(
  issueKey: Uint8Array,
  programId = V2_PROGRAM_ID,
): [PublicKey, number] {
  const [protocol] = deriveProtocolPda(programId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('issue'), protocol.toBuffer(), exact32(issueKey, 'issue_key')],
    programId,
  );
}

export function deriveCommitmentEventPda(
  issue: PublicKey,
  eventId: Uint8Array,
  programId = V2_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('event'), issue.toBuffer(), exact32(eventId, 'event_id')],
    programId,
  );
}

export function deriveEventRecordHash(input: {
  issueKey: Uint8Array;
  eventId: Uint8Array;
  eventType: number;
  category: number;
  sequence: bigint;
  payloadHash: Uint8Array;
  metadataHash: Uint8Array;
  issueEvidenceHash: Uint8Array;
  locationHash: Uint8Array;
  lifecycle: number;
  publicationRemoved: boolean;
}): Buffer {
  if (input.sequence < 1n || input.sequence > V2_MAX_SEQUENCE) {
    throw new Error('sequence_invalid');
  }
  const sequence = Buffer.alloc(8);
  sequence.writeBigUInt64LE(input.sequence);
  return sha256(
    domain('nagarik:v2:event-record'),
    exact32(input.issueKey, 'issue_key'),
    exact32(input.eventId, 'event_id'),
    discriminant(input.eventType, 4, 'event_type'),
    discriminant(input.category, 6, 'category'),
    sequence,
    exact32(input.payloadHash, 'payload_hash'),
    exact32(input.metadataHash, 'metadata_hash'),
    exact32(input.issueEvidenceHash, 'issue_evidence_hash'),
    exact32(input.locationHash, 'location_hash'),
    discriminant(input.lifecycle, 4, 'lifecycle'),
    Buffer.from([input.publicationRemoved ? 1 : 0]),
  );
}

export function deriveStreamHead(input: {
  stream: 'timeline' | 'handoff';
  previousHead: Uint8Array;
  eventId: Uint8Array;
  eventType: number;
  eventRecordHash: Uint8Array;
}): Buffer {
  return sha256(
    domain(`nagarik:v2:${input.stream}`),
    exact32(input.previousHead, 'previous_head'),
    exact32(input.eventId, 'event_id'),
    discriminant(input.eventType, 4, 'event_type'),
    exact32(input.eventRecordHash, 'event_record_hash'),
  );
}
