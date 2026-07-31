import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveCommitmentEventPda,
  deriveEventRecordHash,
  deriveIssueKey,
  deriveIssuePda,
  deriveProtocolPda,
  deriveStreamHead,
  V2_GENESIS_AUTHORITY,
  V2_PROGRAM_ID,
} from './protocol';
import { safeSolanaRpcUrl, type V2PublicProofExpectation, verifyV2PublicProof } from './readOnly';

const ISSUE_DISCRIMINATOR = Buffer.from([131, 168, 187, 56, 211, 15, 83, 189]);
const EVENT_DISCRIMINATOR = Buffer.from([188, 211, 121, 192, 238, 24, 31, 3]);
const publicId = '6f62862a-c3d3-4758-bd40-3012ab63ab86';
const genesisHash = 'curated-pilot-genesis-hash-0000000000000001';
const signature = '5'.repeat(88);
const finalizedSlot = 421_390;

function fixture() {
  const issueKey = deriveIssueKey(publicId);
  const [protocol] = deriveProtocolPda();
  const [issueAccount, issueBump] = deriveIssuePda(issueKey);
  const eventId = Buffer.alloc(32, 7);
  const [eventAccount, eventBump] = deriveCommitmentEventPda(issueAccount, eventId);
  const metadataHash = Buffer.alloc(32, 2);
  const evidenceHash = Buffer.alloc(32, 3);
  const locationHash = Buffer.alloc(32, 4);
  const payloadHash = Buffer.alloc(32, 5);
  const previousHead = Buffer.alloc(32);
  const recordHash = deriveEventRecordHash({
    issueKey,
    eventId,
    eventType: 0,
    category: 2,
    sequence: 1n,
    payloadHash,
    metadataHash,
    issueEvidenceHash: evidenceHash,
    locationHash,
    lifecycle: 0,
    publicationRemoved: false,
  });
  const timelineHead = deriveStreamHead({
    stream: 'timeline',
    previousHead,
    eventId,
    eventType: 0,
    eventRecordHash: recordHash,
  });
  const handoffHead = Buffer.alloc(32);

  const issueBytes = Buffer.alloc(324);
  ISSUE_DISCRIMINATOR.copy(issueBytes, 0);
  protocol.toBuffer().copy(issueBytes, 8);
  issueKey.copy(issueBytes, 40);
  V2_GENESIS_AUTHORITY.toBuffer().copy(issueBytes, 72);
  issueBytes[104] = 2;
  issueBytes[105] = 0;
  issueBytes[106] = 0;
  metadataHash.copy(issueBytes, 107);
  evidenceHash.copy(issueBytes, 139);
  locationHash.copy(issueBytes, 171);
  timelineHead.copy(issueBytes, 203);
  handoffHead.copy(issueBytes, 235);
  issueBytes.writeBigUInt64LE(1n, 267);
  issueBytes.writeBigInt64LE(100n, 275);
  issueBytes.writeBigInt64LE(100n, 283);
  issueBytes[291] = issueBump;

  const eventBytes = Buffer.alloc(332);
  EVENT_DISCRIMINATOR.copy(eventBytes, 0);
  issueAccount.toBuffer().copy(eventBytes, 8);
  eventId.copy(eventBytes, 40);
  eventBytes[72] = 0;
  eventBytes[73] = 2;
  eventBytes.writeBigUInt64LE(1n, 74);
  previousHead.copy(eventBytes, 82);
  timelineHead.copy(eventBytes, 114);
  payloadHash.copy(eventBytes, 146);
  metadataHash.copy(eventBytes, 178);
  evidenceHash.copy(eventBytes, 210);
  locationHash.copy(eventBytes, 242);
  eventBytes[274] = 0;
  eventBytes[275] = 0;
  eventBytes.writeBigInt64LE(100n, 276);
  V2_GENESIS_AUTHORITY.toBuffer().copy(eventBytes, 284);
  eventBytes[316] = eventBump;

  const expected: V2PublicProofExpectation = {
    publicId,
    genesisHash,
    programId: V2_PROGRAM_ID.toBase58(),
    issueAccount: issueAccount.toBase58(),
    eventAccount: eventAccount.toBase58(),
    signature,
    finalizedSlot,
    updateCount: 1,
    metadataHash: metadataHash.toString('hex'),
    evidenceHash: evidenceHash.toString('hex'),
    locationHash: locationHash.toString('hex'),
    timelineHead: timelineHead.toString('hex'),
    handoffHead: handoffHead.toString('hex'),
    publicationRemoved: false,
  };
  return { eventBytes, expected, issueBytes };
}

function rpcFetch(input: {
  issueBytes: Buffer;
  eventBytes: Buffer;
  secondaryEventBytes?: Buffer;
  failSecondary?: boolean;
}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = async (resource: string | URL | Request, init: RequestInit = {}) => {
    const url = String(resource);
    calls.push({ url, init });
    if (input.failSecondary && url.includes('rpc-two')) throw new Error('provider_unavailable');
    const request = JSON.parse(String(init.body)) as {
      id: number;
      method: string;
      params: unknown[];
    };
    let result: unknown;
    if (request.method === 'getGenesisHash') {
      result = genesisHash;
    } else if (request.method === 'getAccountInfo') {
      const address = String(request.params[0]);
      const isEvent = address === fixture().expected.eventAccount;
      const bytes = isEvent
        ? url.includes('rpc-two') && input.secondaryEventBytes
          ? input.secondaryEventBytes
          : input.eventBytes
        : input.issueBytes;
      result = {
        context: { slot: finalizedSlot + 10 },
        value: {
          data: [bytes.toString('base64'), 'base64'],
          executable: false,
          lamports: 1,
          owner: V2_PROGRAM_ID.toBase58(),
          rentEpoch: 1,
          space: bytes.byteLength,
        },
      };
    } else if (request.method === 'getTransaction') {
      const expected = fixture().expected;
      result = {
        slot: finalizedSlot,
        meta: { err: null },
        transaction: {
          signatures: [signature],
          message: {
            accountKeys: [expected.issueAccount, expected.eventAccount, V2_PROGRAM_ID.toBase58()],
            instructions: [{ programIdIndex: 2, accounts: [0, 1] }],
          },
        },
      };
    } else {
      throw new Error('unexpected_rpc_method');
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { calls, fetchImpl };
}

test('dual-provider verifier confirms byte-identical finalized issue and event bindings', async () => {
  const data = fixture();
  const rpc = rpcFetch(data);
  const result = await verifyV2PublicProof(data.expected, {
    primaryUrl: 'https://rpc-one.example/v2?api-key=primary',
    secondaryUrl: 'https://rpc-two.example/v2?api-key=secondary',
    fetchImpl: rpc.fetchImpl,
  });

  assert.equal(result.status, 'confirmed');
  assert.equal(result.reason, 'binding_confirmed');
  assert.equal(result.agreedIndependentProviders, 2);
  assert.equal(result.minimumFinalizedSlot, finalizedSlot);
  assert.equal(result.owner, V2_PROGRAM_ID.toBase58());
  assert.match(result.issueAccountSha256 ?? '', /^[0-9a-f]{64}$/);
  assert.match(result.eventAccountSha256 ?? '', /^[0-9a-f]{64}$/);
  assert.equal(rpc.calls.length, 8);
  for (const call of rpc.calls) {
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.redirect, 'error');
    assert.equal(call.init.credentials, 'omit');
  }
  assert.doesNotMatch(JSON.stringify(result), /rpc-one|rpc-two|api-key/);
});

test('one unavailable provider never becomes a confirmed proof', async () => {
  const data = fixture();
  const rpc = rpcFetch({ ...data, failSecondary: true });
  const result = await verifyV2PublicProof(data.expected, {
    primaryUrl: 'https://rpc-one.example',
    secondaryUrl: 'https://rpc-two.example',
    fetchImpl: rpc.fetchImpl,
  });
  assert.equal(result.status, 'unknown_dependency_error');
  assert.equal(result.reason, 'provider_unavailable');
  assert.equal(result.agreedIndependentProviders, 1);
  assert.equal(result.issueAccountSha256, null);
});

test('provider byte disagreement is reported without publishing either observation', async () => {
  const data = fixture();
  const changed = Buffer.from(data.eventBytes);
  changed[331] = 1;
  const rpc = rpcFetch({ ...data, secondaryEventBytes: changed });
  const result = await verifyV2PublicProof(data.expected, {
    primaryUrl: 'https://rpc-one.example',
    secondaryUrl: 'https://rpc-two.example',
    fetchImpl: rpc.fetchImpl,
  });
  assert.equal(result.status, 'unknown_dependency_error');
  assert.equal(result.reason, 'provider_disagreement');
  assert.equal(result.agreedIndependentProviders, 0);
  assert.equal(result.eventAccountSha256, null);
});

test('two agreeing providers expose a deterministic stored-binding mismatch', async () => {
  const data = fixture();
  const rpc = rpcFetch(data);
  const result = await verifyV2PublicProof(
    { ...data.expected, metadataHash: '9'.repeat(64) },
    {
      primaryUrl: 'https://rpc-one.example',
      secondaryUrl: 'https://rpc-two.example',
      fetchImpl: rpc.fetchImpl,
    },
  );
  assert.equal(result.status, 'mismatch');
  assert.equal(result.reason, 'binding_mismatch');
  assert.equal(result.agreedIndependentProviders, 2);
});

test('RPC endpoints reject local networks, URL userinfo, and one-provider aliases', async () => {
  assert.equal(safeSolanaRpcUrl('https://127.0.0.1/rpc'), null);
  assert.equal(safeSolanaRpcUrl('https://user:pass@rpc.example/rpc'), null);
  assert.ok(safeSolanaRpcUrl('https://rpc.example/rpc?api-key=opaque'));

  const data = fixture();
  const result = await verifyV2PublicProof(data.expected, {
    primaryUrl: 'https://rpc.example/primary',
    secondaryUrl: 'https://rpc.example/secondary',
    fetchImpl: async () => {
      throw new Error('must_not_fetch');
    },
  });
  assert.equal(result.status, 'unknown_dependency_error');
  assert.equal(result.reason, 'verifier_configuration_invalid');
});
