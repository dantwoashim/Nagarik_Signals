import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { PGlite, type Transaction } from '@electric-sql/pglite';

import type { QueryExecutor } from '../db/query';
import { V2_PROGRAM_ID } from '../solana/v2/protocol';
import { buildChainJob, type ChainJobEnvelope, type PreparedChainJob } from './chainJob';
import { createObservedEvent, processChainOutboxBatch } from './outboxWorker';
import type { ChainSigner, ObservedCommitmentEvent } from './signer';

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

function creationJob(publicIssueId: string, databaseEventId: string): ChainJobEnvelope {
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

async function seedJob(
  query: QueryExecutor,
  input: {
    issueId: string;
    outboxId: string;
    job: ChainJobEnvelope;
    canonicalPayload?: unknown;
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
       $6, decode($7, 'hex'), $8::jsonb, decode($9, 'hex'), 'pending'
     )`,
    [
      input.outboxId,
      input.job.operationId,
      organizationId,
      input.issueId,
      input.job.operation,
      input.job.next.updateCount,
      input.job.eventId,
      JSON.stringify(input.canonicalPayload ?? input.job),
      input.job.payloadHash,
    ],
  );
}

test('chain outbox finalizes exact events and quarantines ambiguous or conflicting jobs', async () => {
  const database = new PGlite();
  const query = executor(database);
  const transaction = <T>(operation: (active: QueryExecutor) => Promise<T>) =>
    database.transaction((active) => operation(executor(active)));
  const cases = {
    submitted: {
      issueId: 'a0000000-0000-4000-8000-000000000001',
      outboxId: 'b0000000-0000-4000-8000-000000000001',
      job: creationJob(
        '11000000-0000-4000-8000-000000000001',
        '61000000-0000-4000-8000-000000000001',
      ),
    },
    preexisting: {
      issueId: 'a0000000-0000-4000-8000-000000000002',
      outboxId: 'b0000000-0000-4000-8000-000000000002',
      job: creationJob(
        '22000000-0000-4000-8000-000000000002',
        '62000000-0000-4000-8000-000000000002',
      ),
    },
    unknown: {
      issueId: 'a0000000-0000-4000-8000-000000000003',
      outboxId: 'b0000000-0000-4000-8000-000000000003',
      job: creationJob(
        '33000000-0000-4000-8000-000000000003',
        '63000000-0000-4000-8000-000000000003',
      ),
    },
    conflict: {
      issueId: 'a0000000-0000-4000-8000-000000000004',
      outboxId: 'b0000000-0000-4000-8000-000000000004',
      job: creationJob(
        '44000000-0000-4000-8000-000000000004',
        '64000000-0000-4000-8000-000000000004',
      ),
    },
    invalid: {
      issueId: 'a0000000-0000-4000-8000-000000000005',
      outboxId: 'b0000000-0000-4000-8000-000000000005',
      job: creationJob(
        '55000000-0000-4000-8000-000000000005',
        '65000000-0000-4000-8000-000000000005',
      ),
    },
  };
  const submitted: string[] = [];
  let unknownEventVisible = false;
  const observed = (job: ChainJobEnvelope): ObservedCommitmentEvent =>
    createObservedEvent(job, {
      signature,
      finalizedSlot: 42,
      accountSha256: 'aa'.repeat(32),
    });
  const canonicalJobs = new Map(
    Object.values(cases).map((entry) => [entry.job.publicIssueId, entry.job]),
  );
  const signer: ChainSigner = {
    profile: {
      cluster: 'localnet',
      genesisHash: 'local-genesis-hash',
      programId: V2_PROGRAM_ID.toBase58(),
      authority: '94GGj4zzhRQV5FzpL3RmYoZrH5qoLhdRMKYj9t9ndv5i',
    },
    async inspect(job: PreparedChainJob) {
      if (job.publicIssueId === cases.preexisting.job.publicIssueId) {
        return observed(cases.preexisting.job);
      }
      if (unknownEventVisible && job.publicIssueId === cases.unknown.job.publicIssueId) {
        return observed(cases.unknown.job);
      }
      return null;
    },
    async submit(job: PreparedChainJob) {
      submitted.push(job.publicIssueId);
      return signature;
    },
    async confirm(job: PreparedChainJob) {
      if (job.publicIssueId === cases.unknown.job.publicIssueId) return null;
      const canonical = canonicalJobs.get(job.publicIssueId);
      if (!canonical) throw new Error('test_job_missing');
      const exact = observed(canonical);
      return job.publicIssueId === cases.conflict.job.publicIssueId
        ? { ...exact, payloadHash: 'ff'.repeat(32) }
        : exact;
    },
  };

  try {
    await applySchema(database);
    await query.query(
      `insert into nagarik.organizations(id, slug, name)
       values ($1::uuid, 'chain-worker-test', 'Chain worker test')`,
      [organizationId],
    );
    await seedJob(query, cases.submitted);
    await seedJob(query, cases.preexisting);
    await seedJob(query, cases.unknown);
    await seedJob(query, cases.conflict);
    await seedJob(query, {
      ...cases.invalid,
      canonicalPayload: { ...cases.invalid.job, operationId: 'ff'.repeat(32) },
    });

    const dependencies = {
      query,
      transaction,
      signer,
      workerId: 'chain-worker-test',
      now: () => new Date('2020-01-01T00:00:00.000Z'),
    };
    assert.deepEqual(await processChainOutboxBatch(dependencies, 10), {
      claimed: 5,
      confirmed: 2,
      submittedUnknown: 1,
      retry: 0,
      deadLetter: 2,
    });
    assert.deepEqual(submitted.sort(), [
      cases.submitted.job.publicIssueId,
      cases.unknown.job.publicIssueId,
      cases.conflict.job.publicIssueId,
    ]);

    const states = await query.query(
      `select
         job.id::text,
         job.state,
         job.last_error_category,
         issue.confirmed_update_count,
         issue.blocked_from_sequence
       from nagarik.outbox_jobs job
       join nagarik.issues issue on issue.id = job.issue_id
       order by job.id`,
    );
    assert.deepEqual(
      states.map((row) => ({
        id: row.id,
        state: row.state,
        error: row.last_error_category,
        confirmed: Number(row.confirmed_update_count),
        blocked: row.blocked_from_sequence === null ? null : Number(row.blocked_from_sequence),
      })),
      [
        {
          id: cases.submitted.outboxId,
          state: 'confirmed',
          error: null,
          confirmed: 1,
          blocked: null,
        },
        {
          id: cases.preexisting.outboxId,
          state: 'confirmed',
          error: null,
          confirmed: 1,
          blocked: null,
        },
        {
          id: cases.unknown.outboxId,
          state: 'submitted_unknown',
          error: 'confirmation_timeout',
          confirmed: 0,
          blocked: null,
        },
        {
          id: cases.conflict.outboxId,
          state: 'dead_letter',
          error: 'chain_event_conflict',
          confirmed: 0,
          blocked: 1,
        },
        {
          id: cases.invalid.outboxId,
          state: 'dead_letter',
          error: 'chain_outbox_record_invalid',
          confirmed: 0,
          blocked: 1,
        },
      ],
    );
    const counts = (
      await query.query(
        `select
           (select count(*)::integer from nagarik.issue_chain_bindings) as bindings,
           (select count(*)::integer from nagarik.outbox_attempts) as attempts`,
      )
    )[0];
    assert.deepEqual(
      { bindings: Number(counts.bindings), attempts: Number(counts.attempts) },
      { bindings: 2, attempts: 5 },
    );
    unknownEventVisible = true;
    assert.deepEqual(await processChainOutboxBatch(dependencies, 10), {
      claimed: 1,
      confirmed: 1,
      submittedUnknown: 0,
      retry: 0,
      deadLetter: 0,
    });
    assert.equal(
      submitted.filter((publicId) => publicId === cases.unknown.job.publicIssueId).length,
      1,
    );
    const recovered = await query.query(
      `select
         job.state,
         issue.confirmed_update_count,
         (select count(*)::integer
          from nagarik.issue_chain_bindings binding
          where binding.issue_id = issue.id) as bindings
       from nagarik.outbox_jobs job
       join nagarik.issues issue on issue.id = job.issue_id
       where job.id = $1::uuid`,
      [cases.unknown.outboxId],
    );
    assert.deepEqual(
      {
        state: recovered[0].state,
        confirmed: Number(recovered[0].confirmed_update_count),
        bindings: Number(recovered[0].bindings),
      },
      { state: 'confirmed', confirmed: 1, bindings: 1 },
    );
    assert.equal((await processChainOutboxBatch(dependencies, 10)).claimed, 0);
  } finally {
    await database.close();
  }
});
