import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  deriveCommitmentEventPda,
  deriveEventId,
  deriveEventRecordHash,
  deriveIssueKey,
  deriveIssuePda,
  deriveOperationId,
  deriveProtocolPda,
  deriveRoleGrantPda,
  deriveStreamHead,
  uuidV4Bytes,
  V2_GENESIS_AUTHORITY,
  V2_PROGRAM_ID,
  v2AccountLengths,
} from './protocol';

test('v2 UUID, IDs, PDAs, and bumps match frozen vectors', () => {
  const publicIssueId = '6f62862a-c3d3-4758-bd40-3012ab63ab86';
  const databaseEventId = '2ef9af1c-e62e-4d37-8e09-f576de2033d5';
  const issueKey = deriveIssueKey(publicIssueId);
  const eventId = deriveEventId({
    issueKey,
    eventId: databaseEventId,
    operation: 'issue_created',
  });
  const operationId = deriveOperationId({
    issueKey,
    eventId,
    operation: 'issue_created',
  });
  const [protocol, protocolBump] = deriveProtocolPda();
  const [role, roleBump] = deriveRoleGrantPda(V2_GENESIS_AUTHORITY);
  const [issue, issueBump] = deriveIssuePda(issueKey);
  const [event, eventBump] = deriveCommitmentEventPda(issue, eventId);

  assert.equal(uuidV4Bytes(publicIssueId).toString('hex'), '6f62862ac3d34758bd403012ab63ab86');
  assert.equal(
    issueKey.toString('hex'),
    '96bab5dff162d28490e964b22cbb9f95098af6fa300ca32bbf417c6e9efaa27f',
  );
  assert.equal(
    eventId.toString('hex'),
    '0634e4b9eabaeebf84423273d93bc3709b064262b976652a1f53e105acbeeafe',
  );
  assert.equal(
    operationId.toString('hex'),
    'c7aa444975db43b06ad0d546d9ada4ad6dce875e578d919a108c368462e56848',
  );
  assert.deepEqual(
    {
      protocol: protocol.toBase58(),
      protocolBump,
      role: role.toBase58(),
      roleBump,
      issue: issue.toBase58(),
      issueBump,
      event: event.toBase58(),
      eventBump,
    },
    {
      protocol: 'B1u7TxnDJtmh6CRugrSYQiRhanDzJXGMoJw5DkgH1ftL',
      protocolBump: 254,
      role: '3BmgpH5ubs9ufpFRJ2R5inDbqESEoFKpdPDNYkbABKBX',
      roleBump: 254,
      issue: '5vKnvo9rayumgpb2GgaT7jx5jyzsRowJWRxfq3eDPHJ3',
      issueBump: 254,
      event: 'CBZdhpXQ5tpJKYXyRZAMkzkQC2NmeHDjyrDppPJfebUu',
      eventBump: 251,
    },
  );
});

test('TypeScript event record and timeline head match the Rust vector', () => {
  const record = deriveEventRecordHash({
    issueKey: Buffer.alloc(32, 1),
    eventId: Buffer.alloc(32, 2),
    eventType: 0,
    category: 2,
    sequence: 1n,
    payloadHash: Buffer.alloc(32, 3),
    metadataHash: Buffer.alloc(32, 4),
    issueEvidenceHash: Buffer.alloc(32, 5),
    locationHash: Buffer.alloc(32, 6),
    lifecycle: 0,
    publicationRemoved: false,
  });
  assert.equal(
    deriveStreamHead({
      stream: 'timeline',
      previousHead: Buffer.alloc(32),
      eventId: Buffer.alloc(32, 2),
      eventType: 0,
      eventRecordHash: record,
    }).toString('hex'),
    '28c445a308a0441b5419981e6fb66e7fcba32007f9dd668ceb2805bb7c6ebb51',
  );
});

test('generated v2 IDL preserves program, genesis, instructions, and field order', async () => {
  const idl = JSON.parse(await readFile('idl/nagarik_signal_v2.json', 'utf8')) as {
    address: string;
    constants: Array<{ name: string; value: string }>;
    instructions: Array<{ name: string }>;
    types: Array<{ name: string; type: { fields: Array<{ name: string }> } }>;
  };
  assert.equal(idl.address, V2_PROGRAM_ID.toBase58());
  assert.equal(
    idl.constants.find((entry) => entry.name === 'GENESIS_AUTHORITY')?.value,
    V2_GENESIS_AUTHORITY.toBase58(),
  );
  assert.deepEqual(idl.instructions.map((instruction) => instruction.name).sort(), [
    'accept_authority',
    'append_lifecycle',
    'cancel_authority_proposal',
    'checkpoint_handoff',
    'commit_metadata_version',
    'create_issue',
    'initialize_protocol',
    'mark_publication_removed',
    'propose_authority',
    'set_pause',
    'set_role',
  ]);
  const expectedFields = {
    ProtocolConfig: [
      'version',
      'authority',
      'pending_authority',
      'paused',
      'revision',
      'bump',
      'reserved',
    ],
    RoleGrant: [
      'protocol',
      'subject',
      'role_bits',
      'active',
      'granted_at',
      'revoked_at',
      'revision',
      'bump',
      'reserved',
    ],
    IssueCommitment: [
      'protocol',
      'issue_key',
      'issuer',
      'category',
      'lifecycle',
      'publication_removed',
      'metadata_hash',
      'evidence_hash',
      'location_hash',
      'timeline_head',
      'handoff_head',
      'update_count',
      'created_at',
      'updated_at',
      'bump',
      'reserved',
    ],
    CommitmentEvent: [
      'issue',
      'event_id',
      'event_type',
      'category',
      'sequence',
      'previous_head',
      'new_head',
      'payload_hash',
      'metadata_hash',
      'issue_evidence_hash',
      'location_hash',
      'lifecycle',
      'publication_removed',
      'occurred_at',
      'actor',
      'bump',
      'reserved',
    ],
  };
  for (const [name, fields] of Object.entries(expectedFields)) {
    assert.deepEqual(
      idl.types.find((type) => type.name === name)?.type.fields.map((field) => field.name),
      fields,
    );
  }
  assert.deepEqual(v2AccountLengths, {
    protocolConfig: 140,
    roleGrant: 124,
    issueCommitment: 324,
    commitmentEvent: 332,
  });
});
