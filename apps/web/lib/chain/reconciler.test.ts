import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { PGlite, type Transaction } from '@electric-sql/pglite';

import type { QueryExecutor } from '../db/query';
import { V2_PROGRAM_ID } from '../solana/v2/protocol';
import { buildChainJob, type ChainJobEnvelope } from './chainJob';
import { createObservedEvent } from './outboxWorker';
import { reconcileChainOutbox } from './reconciler';
import type { ChainSigner } from './signer';

const organizationId = '10000000-0000-4000-8000-000000000001';
const zero = '0'.repeat(64);
const signature = '2'.repeat(64);

function executor(transaction: PGlite | Transaction): QueryExecutor {
  return {
    async query(statement, parameters = []) {
      const result = await transaction.query<Record<string, unknown>>(statement, [
        ...parameters,
      ] as never[]);
      return result.rows;
    },
  };
}

async function applySchema(database: PGlite): Promise<void> {
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create function auth.uid()
    returns uuid
    language sql
    stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  const directory = path.resolve('supabase', 'migrations');
  for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
    await database.exec(await readFile(path.join(directory, name), 'utf8'));
  }
}

function job(publicIssueId: string, databaseEventId: string): ChainJobEnvelope {
  return buildChainJob({
    operation: 'issue_created',
    publicIssueId,
    databaseEventId,
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
  });
}

async function seed(
  query: QueryExecutor,
  input: {
    issueId: string;
    outboxId: string;
    job: ChainJobEnvelope;
    state: 'pending' | 'confirmed';
  },
): Promise<void> {
  await query.query(
    `insert into nagarik.issues(
       id, public_id, organization_id, workflow_version, record_kind,
       publication_state, lifecycle
     )
     values ($1::uuid, $2::uuid, $3::uuid, 'v2', 'community_report', 'commit_pending', 'open')`,
    [input.issueId, input.job.publicIssueId, organizationId],
  );
  await query.query(
    `insert into nagarik.outbox_jobs(
       id, operation_id, organization_id, issue_id, operation_type,
       chain_sequence, event_id, canonical_payload, payload_hash, state
     )
     values (
       $1::uuid, decode($2, 'hex'), $3::uuid, $4::uuid, $5,
       $6, decode($7, 'hex'), $8::jsonb, decode($9, 'hex'), $10
     )`,
    [
      input.outboxId,
      input.job.operationId,
      organizationId,
      input.issueId,
      input.job.operation,
      input.job.next.updateCount,
      input.job.eventId,
      JSON.stringify(input.job),
      input.job.payloadHash,
      input.state,
    ],
  );
}

test('reconciliation dry-runs drift and repairs only exact observed events', async () => {
  const database = new PGlite();
  const query = executor(database);
  const transaction = <T>(operation: (active: QueryExecutor) => Promise<T>) =>
    database.transaction((active) => operation(executor(active)));
  const cases = {
    pending: {
      issueId: 'a1000000-0000-4000-8000-000000000001',
      outboxId: 'b1000000-0000-4000-8000-000000000001',
      state: 'pending' as const,
      job: job('11000000-0000-4000-8000-000000000011', '61000000-0000-4000-8000-000000000011'),
    },
    drifted: {
      issueId: 'a1000000-0000-4000-8000-000000000002',
      outboxId: 'b1000000-0000-4000-8000-000000000002',
      state: 'confirmed' as const,
      job: job('22000000-0000-4000-8000-000000000022', '62000000-0000-4000-8000-000000000022'),
    },
    missing: {
      issueId: 'a1000000-0000-4000-8000-000000000003',
      outboxId: 'b1000000-0000-4000-8000-000000000003',
      state: 'confirmed' as const,
      job: job('33000000-0000-4000-8000-000000000033', '63000000-0000-4000-8000-000000000033'),
    },
  };
  const envelopes = new Map(
    Object.values(cases).map((entry) => [entry.job.publicIssueId, entry.job]),
  );
  const signer: ChainSigner = {
    profile: {
      cluster: 'localnet',
      genesisHash: 'local-genesis-hash',
      programId: V2_PROGRAM_ID.toBase58(),
      authority: '94GGj4zzhRQV5FzpL3RmYoZrH5qoLhdRMKYj9t9ndv5i',
    },
    async inspect(prepared) {
      if (prepared.publicIssueId === cases.missing.job.publicIssueId) return null;
      const envelope = envelopes.get(prepared.publicIssueId);
      if (!envelope) throw new Error('test_job_missing');
      return createObservedEvent(envelope, {
        signature,
        finalizedSlot: 42,
        accountSha256: 'aa'.repeat(32),
      });
    },
    async submit() {
      throw new Error('reconciliation_must_not_submit');
    },
    async confirm() {
      throw new Error('reconciliation_must_not_confirm');
    },
  };

  try {
    await applySchema(database);
    await query.query(
      `insert into nagarik.organizations(id, slug, name)
       values ($1::uuid, 'reconciliation-test', 'Reconciliation test')`,
      [organizationId],
    );
    await seed(query, cases.pending);
    await seed(query, cases.drifted);
    await seed(query, cases.missing);
    const dependencies = {
      query,
      transaction,
      signer,
      workerId: 'reconciliation-test',
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    };

    const dryRun = await reconcileChainOutbox(dependencies, { dryRun: true });
    assert.deepEqual(
      {
        inspected: dryRun.inspected,
        recoverable: dryRun.recoverable,
        conflict: dryRun.conflict,
        repaired: dryRun.repaired,
      },
      { inspected: 3, recoverable: 2, conflict: 1, repaired: 0 },
    );
    const unchanged = await query.query(
      `select count(*)::integer as count
       from nagarik.issue_chain_bindings`,
    );
    assert.equal(Number(unchanged[0].count), 0);

    const repair = await reconcileChainOutbox(dependencies, { dryRun: false });
    assert.deepEqual(
      {
        inspected: repair.inspected,
        repaired: repair.repaired,
        conflict: repair.conflict,
      },
      { inspected: 3, repaired: 2, conflict: 1 },
    );
    const repairedRows = await query.query(
      `select
         (select count(*)::integer from nagarik.issue_chain_bindings) as bindings,
         (select count(*)::integer from nagarik.outbox_attempts) as attempts,
         (select count(*)::integer from nagarik.issues where confirmed_update_count = 1) as issues`,
    );
    assert.deepEqual(
      {
        bindings: Number(repairedRows[0].bindings),
        attempts: Number(repairedRows[0].attempts),
        issues: Number(repairedRows[0].issues),
      },
      { bindings: 2, attempts: 2, issues: 2 },
    );

    const converged = await reconcileChainOutbox(dependencies, { dryRun: true });
    assert.deepEqual(
      {
        consistent: converged.consistent,
        conflict: converged.conflict,
        recoverable: converged.recoverable,
      },
      { consistent: 2, conflict: 1, recoverable: 0 },
    );
  } finally {
    await database.close();
  }
});
