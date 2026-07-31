import assert from 'node:assert/strict';
import test from 'node:test';

import { buildChainJob, prepareChainJob } from './chainJob';
import {
  BoundedChainSigner,
  ChainExecutionError,
  type ChainSimulation,
  type V2ChainTransport,
} from './signer';

import { V2_PROGRAM_ID } from '../solana/v2/protocol';

const zero = '0'.repeat(64);
const signature = '2'.repeat(64);

function job() {
  return prepareChainJob(
    buildChainJob({
      operation: 'issue_created',
      publicIssueId: '6f62862a-c3d3-4758-bd40-3012ab63ab86',
      databaseEventId: '2ef9af1c-e62e-4d37-8e09-f576de2033d5',
      payloadHash: '11'.repeat(32),
      expected: {
        updateCount: 0,
        timelineHead: zero,
        handoffHead: zero,
        category: 2,
        lifecycle: 0,
        publicationRemoved: false,
        metadataHash: zero,
        evidenceHash: zero,
        locationHash: zero,
      },
      next: {
        category: 2,
        lifecycle: 0,
        publicationRemoved: false,
        metadataHash: '22'.repeat(32),
        evidenceHash: '33'.repeat(32),
        locationHash: '44'.repeat(32),
      },
    }),
  );
}

function transport(
  simulation: Partial<ChainSimulation> = {},
  profile: Partial<V2ChainTransport['profile']> = {},
): V2ChainTransport {
  const authority = '94GGj4zzhRQV5FzpL3RmYoZrH5qoLhdRMKYj9t9ndv5i';
  return {
    profile: {
      cluster: 'localnet',
      genesisHash: 'local-genesis-hash-with-stable-test-value',
      programId: V2_PROGRAM_ID.toBase58(),
      authority,
      ...profile,
    },
    async readEvent() {
      return null;
    },
    async simulate() {
      return {
        ok: true,
        programId: V2_PROGRAM_ID.toBase58(),
        authority,
        instructionCount: 1,
        computeUnits: 100_000,
        feeLamports: 5_000,
        hasValueTransfer: false,
        ...simulation,
      };
    },
    async submit() {
      return signature;
    },
    async confirm() {
      return null;
    },
  };
}

test('bounded signer accepts only one simulated v2 instruction within limits', async () => {
  const expected = {
    genesisHash: 'local-genesis-hash-with-stable-test-value',
    authority: '94GGj4zzhRQV5FzpL3RmYoZrH5qoLhdRMKYj9t9ndv5i',
  };
  assert.equal(await new BoundedChainSigner(transport(), expected).submit(job()), signature);
  await assert.rejects(
    new BoundedChainSigner(transport({ hasValueTransfer: true }), expected).submit(job()),
    (error: unknown) =>
      error instanceof ChainExecutionError && error.category === 'chain_signing_policy_rejected',
  );
  await assert.rejects(
    new BoundedChainSigner(transport({ computeUnits: 400_000 }), expected).submit(job()),
    (error: unknown) =>
      error instanceof ChainExecutionError && error.category === 'chain_signing_policy_rejected',
  );
});

test('bounded signer rejects wrong program, genesis, or authority profiles', () => {
  assert.throws(
    () =>
      new BoundedChainSigner(transport({}, { programId: '11111111111111111111111111111111' }), {
        genesisHash: 'local-genesis-hash-with-stable-test-value',
        authority: '94GGj4zzhRQV5FzpL3RmYoZrH5qoLhdRMKYj9t9ndv5i',
      }),
    /chain_profile_mismatch/,
  );
});
