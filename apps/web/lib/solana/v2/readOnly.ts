import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

import { PublicKey } from '@solana/web3.js';

import {
  deriveCommitmentEventPda,
  deriveEventRecordHash,
  deriveIssueKey,
  deriveIssuePda,
  deriveProtocolPda,
  deriveStreamHead,
  V2_MAX_SEQUENCE,
  V2_PROGRAM_ID,
  v2AccountLengths,
} from './protocol';

const ISSUE_DISCRIMINATOR = Buffer.from([131, 168, 187, 56, 211, 15, 83, 189]);
const EVENT_DISCRIMINATOR = Buffer.from([188, 211, 121, 192, 238, 24, 31, 3]);
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAX_RPC_RESPONSE_BYTES = 64 * 1024;
const REQUIRED_PROVIDERS = 2;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type RpcAccount = {
  contextSlot: number;
  data: Buffer;
  executable: boolean;
  owner: string;
  sha256: string;
};

type IssueCommitment = {
  protocol: string;
  issueKey: string;
  category: number;
  lifecycle: number;
  publicationRemoved: boolean;
  metadataHash: string;
  evidenceHash: string;
  locationHash: string;
  timelineHead: string;
  handoffHead: string;
  updateCount: number;
  createdAt: bigint;
  updatedAt: bigint;
  bump: number;
};

type CommitmentEvent = {
  issue: string;
  eventId: string;
  eventIdBytes: Buffer;
  eventType: number;
  category: number;
  sequence: number;
  previousHead: string;
  previousHeadBytes: Buffer;
  newHead: string;
  payloadHash: string;
  payloadHashBytes: Buffer;
  metadataHash: string;
  metadataHashBytes: Buffer;
  evidenceHash: string;
  evidenceHashBytes: Buffer;
  locationHash: string;
  locationHashBytes: Buffer;
  lifecycle: number;
  publicationRemoved: boolean;
  occurredAt: bigint;
  bump: number;
};

type ProviderObservation = {
  genesisHash: string;
  issueAccount: RpcAccount;
  issue: IssueCommitment;
  eventAccount: RpcAccount;
  event: CommitmentEvent;
  transactionSlot: number;
};

export type V2PublicProofExpectation = {
  publicId: string;
  genesisHash: string;
  programId: string;
  issueAccount: string;
  eventAccount: string | null;
  signature: string;
  finalizedSlot: number;
  updateCount: number;
  metadataHash: string;
  evidenceHash: string;
  locationHash: string;
  timelineHead: string;
  handoffHead: string;
  publicationRemoved: boolean;
};

export type V2PublicProofVerification = {
  status: 'confirmed' | 'mismatch' | 'unknown_dependency_error';
  reason:
    | 'binding_confirmed'
    | 'binding_mismatch'
    | 'provider_disagreement'
    | 'provider_unavailable'
    | 'verifier_configuration_invalid';
  requiredIndependentProviders: 2;
  agreedIndependentProviders: number;
  minimumFinalizedSlot: number | null;
  owner: string | null;
  issueAccountSha256: string | null;
  eventAccountSha256: string | null;
  observedUpdateCount: number | null;
  observedTimelineHead: string | null;
  observedHandoffHead: string | null;
  observedPublicationRemoved: boolean | null;
};

function blockedHostname(hostname: string): boolean {
  const normalized = hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^\[|\]$/g, '');
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal')
  ) {
    return true;
  }
  const family = isIP(normalized);
  if (family === 4) {
    const octets = normalized.split('.').map(Number);
    return (
      octets[0] === 0 ||
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    );
  }
  if (family === 6) {
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    );
  }
  return false;
}

export function safeSolanaRpcUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !blockedHostname(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
}

function objectValue(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(error);
  return value as Record<string, unknown>;
}

function safeInteger(value: unknown, error: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(error);
  return Number(value);
}

function publicKey(value: unknown, error: string): string {
  if (typeof value !== 'string') throw new Error(error);
  try {
    const key = new PublicKey(value);
    if (key.toBase58() !== value) throw new Error(error);
    return value;
  } catch {
    throw new Error(error);
  }
}

function exactHash(value: string, error: string): string {
  const normalized = value.toLowerCase();
  if (!HASH_PATTERN.test(normalized)) throw new Error(error);
  return normalized;
}

function bytesHex(value: Uint8Array): string {
  return Buffer.from(value).toString('hex');
}

function readBoolean(bytes: Buffer, offset: number, error: string): boolean {
  if (bytes[offset] !== 0 && bytes[offset] !== 1) throw new Error(error);
  return bytes[offset] === 1;
}

function readSafeU64(bytes: Buffer, offset: number, error: string): number {
  const value = bytes.readBigUInt64LE(offset);
  if (value > V2_MAX_SEQUENCE) throw new Error(error);
  return Number(value);
}

function decodeIssueCommitment(bytes: Buffer): IssueCommitment {
  if (
    bytes.byteLength !== v2AccountLengths.issueCommitment ||
    !bytes.subarray(0, 8).equals(ISSUE_DISCRIMINATOR)
  ) {
    throw new Error('rpc_issue_account_layout_invalid');
  }
  const category = bytes[104];
  const lifecycle = bytes[105];
  if (category > 6 || lifecycle > 4) throw new Error('rpc_issue_account_enum_invalid');
  return {
    protocol: new PublicKey(bytes.subarray(8, 40)).toBase58(),
    issueKey: bytesHex(bytes.subarray(40, 72)),
    category,
    lifecycle,
    publicationRemoved: readBoolean(bytes, 106, 'rpc_issue_account_boolean_invalid'),
    metadataHash: bytesHex(bytes.subarray(107, 139)),
    evidenceHash: bytesHex(bytes.subarray(139, 171)),
    locationHash: bytesHex(bytes.subarray(171, 203)),
    timelineHead: bytesHex(bytes.subarray(203, 235)),
    handoffHead: bytesHex(bytes.subarray(235, 267)),
    updateCount: readSafeU64(bytes, 267, 'rpc_issue_update_count_invalid'),
    createdAt: bytes.readBigInt64LE(275),
    updatedAt: bytes.readBigInt64LE(283),
    bump: bytes[291],
  };
}

function decodeCommitmentEvent(bytes: Buffer): CommitmentEvent {
  if (
    bytes.byteLength !== v2AccountLengths.commitmentEvent ||
    !bytes.subarray(0, 8).equals(EVENT_DISCRIMINATOR)
  ) {
    throw new Error('rpc_event_account_layout_invalid');
  }
  const eventType = bytes[72];
  const category = bytes[73];
  const lifecycle = bytes[274];
  if (eventType > 4 || category > 6 || lifecycle > 4) {
    throw new Error('rpc_event_account_enum_invalid');
  }
  return {
    issue: new PublicKey(bytes.subarray(8, 40)).toBase58(),
    eventId: bytesHex(bytes.subarray(40, 72)),
    eventIdBytes: Buffer.from(bytes.subarray(40, 72)),
    eventType,
    category,
    sequence: readSafeU64(bytes, 74, 'rpc_event_sequence_invalid'),
    previousHead: bytesHex(bytes.subarray(82, 114)),
    previousHeadBytes: Buffer.from(bytes.subarray(82, 114)),
    newHead: bytesHex(bytes.subarray(114, 146)),
    payloadHash: bytesHex(bytes.subarray(146, 178)),
    payloadHashBytes: Buffer.from(bytes.subarray(146, 178)),
    metadataHash: bytesHex(bytes.subarray(178, 210)),
    metadataHashBytes: Buffer.from(bytes.subarray(178, 210)),
    evidenceHash: bytesHex(bytes.subarray(210, 242)),
    evidenceHashBytes: Buffer.from(bytes.subarray(210, 242)),
    locationHash: bytesHex(bytes.subarray(242, 274)),
    locationHashBytes: Buffer.from(bytes.subarray(242, 274)),
    lifecycle,
    publicationRemoved: readBoolean(bytes, 275, 'rpc_event_account_boolean_invalid'),
    occurredAt: bytes.readBigInt64LE(276),
    bump: bytes[316],
  };
}

async function readBoundedResponse(response: Response): Promise<unknown> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_RPC_RESPONSE_BYTES) {
    throw new Error('rpc_response_too_large');
  }
  if (!response.body) throw new Error('rpc_response_body_missing');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > MAX_RPC_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('rpc_response_too_large');
    }
    chunks.push(next.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks, total).toString('utf8')) as unknown;
  } catch {
    throw new Error('rpc_response_json_invalid');
  }
}

function createRpcClient(url: URL, fetchImpl: FetchLike, timeoutMs: number) {
  return async (method: string, params: readonly unknown[]): Promise<unknown> => {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error('rpc_http_error');
    const envelope = objectValue(await readBoundedResponse(response), 'rpc_response_invalid');
    if (envelope.jsonrpc !== '2.0' || envelope.id !== 1 || envelope.error !== undefined) {
      throw new Error('rpc_response_invalid');
    }
    if (!('result' in envelope)) throw new Error('rpc_result_missing');
    return envelope.result;
  };
}

function strictBase64(value: unknown): Buffer {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new Error('rpc_account_data_invalid');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new Error('rpc_account_data_invalid');
  return bytes;
}

async function fetchAccount(
  rpc: ReturnType<typeof createRpcClient>,
  address: string,
  minimumSlot: number,
): Promise<RpcAccount> {
  const result = objectValue(
    await rpc('getAccountInfo', [
      address,
      { commitment: 'finalized', encoding: 'base64', minContextSlot: minimumSlot },
    ]),
    'rpc_account_result_invalid',
  );
  const context = objectValue(result.context, 'rpc_account_context_invalid');
  const contextSlot = safeInteger(context.slot, 'rpc_account_context_invalid');
  if (result.value === null) throw new Error('rpc_account_unavailable');
  const account = objectValue(result.value, 'rpc_account_value_invalid');
  if (!Array.isArray(account.data) || account.data[1] !== 'base64') {
    throw new Error('rpc_account_encoding_invalid');
  }
  const data = strictBase64(account.data[0]);
  const space = safeInteger(account.space, 'rpc_account_space_invalid');
  if (space !== data.byteLength) throw new Error('rpc_account_space_invalid');
  if (typeof account.executable !== 'boolean') throw new Error('rpc_account_executable_invalid');
  return {
    contextSlot,
    data,
    executable: account.executable,
    owner: publicKey(account.owner, 'rpc_account_owner_invalid'),
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}

async function fetchFinalizedTransaction(
  rpc: ReturnType<typeof createRpcClient>,
  signature: string,
  programId: string,
  issueAccount: string,
  eventAccount: string,
): Promise<number> {
  const result = objectValue(
    await rpc('getTransaction', [
      signature,
      { commitment: 'finalized', encoding: 'json', maxSupportedTransactionVersion: 0 },
    ]),
    'rpc_transaction_unavailable',
  );
  const slot = safeInteger(result.slot, 'rpc_transaction_slot_invalid');
  const meta = objectValue(result.meta, 'rpc_transaction_meta_invalid');
  if (meta.err !== null) throw new Error('rpc_transaction_failed');
  const transaction = objectValue(result.transaction, 'rpc_transaction_invalid');
  if (!Array.isArray(transaction.signatures) || transaction.signatures[0] !== signature) {
    throw new Error('rpc_transaction_signature_invalid');
  }
  const message = objectValue(transaction.message, 'rpc_transaction_message_invalid');
  if (!Array.isArray(message.accountKeys)) throw new Error('rpc_transaction_accounts_invalid');
  const keys = message.accountKeys.map((entry) => {
    if (typeof entry === 'string') return entry;
    const object = objectValue(entry, 'rpc_transaction_account_invalid');
    return publicKey(object.pubkey, 'rpc_transaction_account_invalid');
  });
  if (!keys.includes(issueAccount) || !keys.includes(eventAccount)) {
    throw new Error('rpc_transaction_binding_invalid');
  }
  if (!Array.isArray(message.instructions)) throw new Error('rpc_transaction_instructions_invalid');
  const programIndex = keys.indexOf(programId);
  const issueIndex = keys.indexOf(issueAccount);
  const eventIndex = keys.indexOf(eventAccount);
  const invokesExpectedProgram = message.instructions.some((entry) => {
    const instruction = objectValue(entry, 'rpc_transaction_instruction_invalid');
    return (
      instruction.programIdIndex === programIndex &&
      Array.isArray(instruction.accounts) &&
      instruction.accounts.includes(issueIndex) &&
      instruction.accounts.includes(eventIndex)
    );
  });
  if (programIndex < 0 || !invokesExpectedProgram) {
    throw new Error('rpc_transaction_instruction_binding_invalid');
  }
  return slot;
}

async function readProvider(
  url: URL,
  expected: V2PublicProofExpectation,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<ProviderObservation> {
  if (!expected.eventAccount) throw new Error('proof_event_account_missing');
  const rpc = createRpcClient(url, fetchImpl, timeoutMs);
  const [genesis, issueAccount, eventAccount, transactionSlot] = await Promise.all([
    rpc('getGenesisHash', []),
    fetchAccount(rpc, expected.issueAccount, expected.finalizedSlot),
    fetchAccount(rpc, expected.eventAccount, expected.finalizedSlot),
    fetchFinalizedTransaction(
      rpc,
      expected.signature,
      expected.programId,
      expected.issueAccount,
      expected.eventAccount,
    ),
  ]);
  if (typeof genesis !== 'string' || genesis.length < 32 || genesis.length > 128) {
    throw new Error('rpc_genesis_hash_invalid');
  }
  return {
    genesisHash: genesis,
    issueAccount,
    issue: decodeIssueCommitment(issueAccount.data),
    eventAccount,
    event: decodeCommitmentEvent(eventAccount.data),
    transactionSlot,
  };
}

function providersAgree(a: ProviderObservation, b: ProviderObservation): boolean {
  return (
    a.genesisHash === b.genesisHash &&
    a.issueAccount.owner === b.issueAccount.owner &&
    a.issueAccount.executable === b.issueAccount.executable &&
    a.issueAccount.sha256 === b.issueAccount.sha256 &&
    a.eventAccount.owner === b.eventAccount.owner &&
    a.eventAccount.executable === b.eventAccount.executable &&
    a.eventAccount.sha256 === b.eventAccount.sha256 &&
    a.transactionSlot === b.transactionSlot
  );
}

function observationMatches(
  observed: ProviderObservation,
  expected: V2PublicProofExpectation,
): boolean {
  if (!expected.eventAccount) return false;
  const issueKey = deriveIssueKey(expected.publicId);
  const [protocol] = deriveProtocolPda(V2_PROGRAM_ID);
  const [derivedIssue, issueBump] = deriveIssuePda(issueKey, V2_PROGRAM_ID);
  const [derivedEvent, eventBump] = deriveCommitmentEventPda(
    derivedIssue,
    observed.event.eventIdBytes,
    V2_PROGRAM_ID,
  );
  const recordHash = deriveEventRecordHash({
    issueKey,
    eventId: observed.event.eventIdBytes,
    eventType: observed.event.eventType,
    category: observed.event.category,
    sequence: BigInt(observed.event.sequence),
    payloadHash: observed.event.payloadHashBytes,
    metadataHash: observed.event.metadataHashBytes,
    issueEvidenceHash: observed.event.evidenceHashBytes,
    locationHash: observed.event.locationHashBytes,
    lifecycle: observed.event.lifecycle,
    publicationRemoved: observed.event.publicationRemoved,
  });
  const stream = observed.event.eventType === 3 ? 'handoff' : 'timeline';
  const computedHead = bytesHex(
    deriveStreamHead({
      stream,
      previousHead: observed.event.previousHeadBytes,
      eventId: observed.event.eventIdBytes,
      eventType: observed.event.eventType,
      eventRecordHash: recordHash,
    }),
  );
  const expectedEventHead = stream === 'handoff' ? expected.handoffHead : expected.timelineHead;

  return (
    expected.programId === V2_PROGRAM_ID.toBase58() &&
    expected.issueAccount === derivedIssue.toBase58() &&
    expected.eventAccount === derivedEvent.toBase58() &&
    observed.genesisHash === expected.genesisHash &&
    observed.issueAccount.owner === expected.programId &&
    observed.eventAccount.owner === expected.programId &&
    !observed.issueAccount.executable &&
    !observed.eventAccount.executable &&
    observed.issueAccount.contextSlot >= expected.finalizedSlot &&
    observed.eventAccount.contextSlot >= expected.finalizedSlot &&
    observed.transactionSlot === expected.finalizedSlot &&
    observed.issue.protocol === protocol.toBase58() &&
    observed.issue.issueKey === bytesHex(issueKey) &&
    observed.issue.bump === issueBump &&
    observed.issue.metadataHash === expected.metadataHash &&
    observed.issue.evidenceHash === expected.evidenceHash &&
    observed.issue.locationHash === expected.locationHash &&
    observed.issue.timelineHead === expected.timelineHead &&
    observed.issue.handoffHead === expected.handoffHead &&
    observed.issue.updateCount === expected.updateCount &&
    observed.issue.publicationRemoved === expected.publicationRemoved &&
    observed.issue.updatedAt >= observed.issue.createdAt &&
    observed.event.issue === expected.issueAccount &&
    observed.event.bump === eventBump &&
    observed.event.sequence === expected.updateCount &&
    observed.event.category === observed.issue.category &&
    observed.event.lifecycle === observed.issue.lifecycle &&
    observed.event.publicationRemoved === observed.issue.publicationRemoved &&
    (observed.event.eventType === 4) === expected.publicationRemoved &&
    observed.event.metadataHash === expected.metadataHash &&
    observed.event.evidenceHash === expected.evidenceHash &&
    observed.event.locationHash === expected.locationHash &&
    observed.event.newHead === computedHead &&
    observed.event.newHead === expectedEventHead
  );
}

function emptyResult(
  status: V2PublicProofVerification['status'],
  reason: V2PublicProofVerification['reason'],
  agreedIndependentProviders = 0,
): V2PublicProofVerification {
  return {
    status,
    reason,
    requiredIndependentProviders: REQUIRED_PROVIDERS,
    agreedIndependentProviders,
    minimumFinalizedSlot: null,
    owner: null,
    issueAccountSha256: null,
    eventAccountSha256: null,
    observedUpdateCount: null,
    observedTimelineHead: null,
    observedHandoffHead: null,
    observedPublicationRemoved: null,
  };
}

function validateExpectation(expected: V2PublicProofExpectation): void {
  publicKey(expected.programId, 'proof_program_id_invalid');
  publicKey(expected.issueAccount, 'proof_issue_account_invalid');
  if (!expected.eventAccount) throw new Error('proof_event_account_missing');
  publicKey(expected.eventAccount, 'proof_event_account_invalid');
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,96}$/.test(expected.signature)) {
    throw new Error('proof_signature_invalid');
  }
  safeInteger(expected.finalizedSlot, 'proof_finalized_slot_invalid');
  safeInteger(expected.updateCount, 'proof_update_count_invalid');
  exactHash(expected.metadataHash, 'proof_metadata_hash_invalid');
  exactHash(expected.evidenceHash, 'proof_evidence_hash_invalid');
  exactHash(expected.locationHash, 'proof_location_hash_invalid');
  exactHash(expected.timelineHead, 'proof_timeline_head_invalid');
  exactHash(expected.handoffHead, 'proof_handoff_head_invalid');
  deriveIssueKey(expected.publicId);
}

export async function verifyV2PublicProof(
  expected: V2PublicProofExpectation,
  options: {
    primaryUrl?: string;
    secondaryUrl?: string;
    fetchImpl?: FetchLike;
    timeoutMs?: number;
  } = {},
): Promise<V2PublicProofVerification> {
  try {
    validateExpectation(expected);
  } catch {
    return emptyResult('mismatch', 'verifier_configuration_invalid');
  }

  const primary = safeSolanaRpcUrl(options.primaryUrl ?? process.env.NAGARIK_RPC_PRIMARY_URL ?? '');
  const secondary = safeSolanaRpcUrl(
    options.secondaryUrl ?? process.env.NAGARIK_RPC_SECONDARY_URL ?? '',
  );
  if (!primary || !secondary || primary.hostname === secondary.hostname) {
    return emptyResult('unknown_dependency_error', 'verifier_configuration_invalid');
  }

  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 2_500, 250), 10_000);
  const fetchImpl = options.fetchImpl ?? fetch;
  const settled = await Promise.allSettled([
    readProvider(primary, expected, fetchImpl, timeoutMs),
    readProvider(secondary, expected, fetchImpl, timeoutMs),
  ]);
  const observations = settled.flatMap((entry) =>
    entry.status === 'fulfilled' ? [entry.value] : [],
  );
  if (observations.length !== REQUIRED_PROVIDERS) {
    return emptyResult('unknown_dependency_error', 'provider_unavailable', observations.length);
  }
  const first = observations[0];
  const second = observations[1];
  if (!providersAgree(first, second)) {
    return emptyResult('unknown_dependency_error', 'provider_disagreement');
  }

  const matches = observationMatches(first, expected) && observationMatches(second, expected);
  return {
    status: matches ? 'confirmed' : 'mismatch',
    reason: matches ? 'binding_confirmed' : 'binding_mismatch',
    requiredIndependentProviders: REQUIRED_PROVIDERS,
    agreedIndependentProviders: REQUIRED_PROVIDERS,
    minimumFinalizedSlot: Math.min(
      first.transactionSlot,
      first.issueAccount.contextSlot,
      first.eventAccount.contextSlot,
      second.transactionSlot,
      second.issueAccount.contextSlot,
      second.eventAccount.contextSlot,
    ),
    owner: first.issueAccount.owner,
    issueAccountSha256: first.issueAccount.sha256,
    eventAccountSha256: first.eventAccount.sha256,
    observedUpdateCount: first.issue.updateCount,
    observedTimelineHead: first.issue.timelineHead,
    observedHandoffHead: first.issue.handoffHead,
    observedPublicationRemoved: first.issue.publicationRemoved,
  };
}
