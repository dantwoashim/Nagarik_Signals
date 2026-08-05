import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import type { QueryExecutor } from '../../apps/web/lib/db/query';
import { parseRemovalInput, removePublishedIssue } from '../../apps/web/lib/services/publication';
import { applyLegacyImport, prepareLegacyImport, type LegacyImportQuery } from './legacyImport';

const sourcePath = path.resolve('data', 'read-model', 'nagarik-signal.json');

async function applySchema(database: PGlite) {
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `);
  const directory = path.resolve('supabase', 'migrations');
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  for (const name of names) {
    await database.exec(await readFile(path.join(directory, name), 'utf8'));
  }
}

function adapter(queryable: PGlite): LegacyImportQuery & QueryExecutor {
  return {
    async query(statement, parameters = []) {
      const result = await queryable.query<Record<string, unknown>>(statement, [
        ...parameters,
      ] as never[]);
      return result.rows;
    },
  };
}

test('legacy removal creates a database tombstone without a chain job', async () => {
  const database = new PGlite();
  const organizationId = '10000000-0000-4000-8000-000000000001';
  const operatorId = '20000000-0000-4000-8000-000000000002';

  try {
    await applySchema(database);
    await database.exec(`
      insert into nagarik.organizations(id, slug, name)
      values ('${organizationId}', 'legacy-removal', 'Legacy removal organization');
      insert into nagarik.operator_profiles(auth_subject, display_name)
      values ('${operatorId}', 'Privacy reviewer');
      update nagarik.capability_kill_switches
      set disabled = false, reason = 'legacy_removal_test'
      where capability = 'operatorMutationsEnabled';
    `);
    const plan = prepareLegacyImport(await readFile(sourcePath, 'utf8'));
    await database.transaction((transaction) =>
      applyLegacyImport(adapter(transaction as unknown as PGlite), plan, organizationId),
    );
    const publicId = plan.issues[0].publicId;
    const current = await database.query<{
      domain_version: number;
      projected_timeline_head: Uint8Array;
    }>(
      `select domain_version, projected_timeline_head
       from nagarik.issues where public_id = $1::uuid`,
      [publicId],
    );
    const transaction = <T>(operation: (query: QueryExecutor) => Promise<T>) =>
      database.transaction((active) => operation(adapter(active as unknown as PGlite)));
    const removal = await removePublishedIssue(
      {
        publicId,
        idempotencyKey: '40000000-0000-4000-8000-000000000004',
        actor: { subjectId: operatorId, organizationId },
        removal: parseRemovalInput({
          expectedDomainVersion: Number(current.rows[0].domain_version),
          expectedTimelineHead: Buffer.from(current.rows[0].projected_timeline_head).toString(
            'hex',
          ),
          reasonCode: 'privacy_request',
          publicMessage: 'This record was removed after a privacy review.',
          privateNote: 'Legacy removal validated by the privacy reviewer.',
          cachePurgeReference: 'vercel-purge:legacy-removal-test',
        }),
      },
      {
        transaction,
        correlationKey: 'legacy-removal-correlation-key-material-001',
        now: () => new Date('2030-01-01T00:00:00.000Z'),
      },
    );

    assert.equal(removal.publicationState, 'removed');
    assert.equal(removal.chainSequence, null);
    assert.equal(removal.checkpointState, 'not_applicable_v1_legacy');
    const evidence = await database.query<{
      publication_state: string;
      title: string | null;
      outbox_count: number;
      recovery_count: number;
    }>(
      `select
         projection.publication_state,
         projection.title,
         (select count(*)::integer from nagarik.outbox_jobs) as outbox_count,
         (select count(*)::integer from nagarik.recovery_ledger) as recovery_count
       from public.issue_projection projection
       where projection.public_id = $1::uuid`,
      [publicId],
    );
    assert.equal(evidence.rows[0].publication_state, 'removed');
    assert.equal(evidence.rows[0].title, null);
    assert.equal(evidence.rows[0].outbox_count, 0);
    assert.equal(evidence.rows[0].recovery_count, 1);
  } finally {
    await database.close();
  }
});

test('legacy import is deterministic and excludes sample and QA records', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const plan = prepareLegacyImport(source);
  const reparsed = prepareLegacyImport(JSON.stringify(JSON.parse(source)));

  assert.equal(plan.sourceIssueCount, 41);
  assert.equal(plan.eligibleIssueCount, 4);
  assert.deepEqual(plan.excludedCounts, {
    qa_fixture: 7,
    illustrative_sample: 30,
  });
  assert.equal(plan.canonicalSourceSha256, reparsed.canonicalSourceSha256);
  assert.equal(plan.issueSetSha256, reparsed.issueSetSha256);
  assert.equal(new Set(plan.issues.map((issue) => issue.publicId)).size, 4);
});

test('legacy import commits atomically and an identical rerun is a no-op', async () => {
  const database = new PGlite();
  const organizationId = '10000000-0000-0000-0000-000000000001';

  try {
    await applySchema(database);
    await database.exec(`
      insert into nagarik.organizations(id, slug, name)
      values (
        '${organizationId}',
        'legacy-import',
        'Legacy import organization'
      )
    `);
    const plan = prepareLegacyImport(await readFile(sourcePath, 'utf8'));

    const first = await database.transaction((transaction) =>
      applyLegacyImport(adapter(transaction as unknown as PGlite), plan, organizationId),
    );
    assert.deepEqual(
      {
        noOp: first.noOp,
        importedIssueCount: first.importedIssueCount,
      },
      {
        noOp: false,
        importedIssueCount: 4,
      },
    );

    const issueCount = await database.query<{ count: number }>(
      'select count(*)::integer as count from nagarik.issues',
    );
    const projectionCount = await database.query<{ count: number }>(
      'select count(*)::integer as count from public.issue_projection',
    );
    const proofCount = await database.query<{ count: number }>(
      'select count(*)::integer as count from public.proof_projection',
    );
    const eventCount = await database.query<{ count: number }>(
      'select count(*)::integer as count from public.event_projection',
    );
    assert.equal(issueCount.rows[0].count, 4);
    assert.equal(projectionCount.rows[0].count, 4);
    assert.equal(proofCount.rows[0].count, 4);
    assert.equal(eventCount.rows[0].count, 4);

    const second = await database.transaction((transaction) =>
      applyLegacyImport(adapter(transaction as unknown as PGlite), plan, organizationId),
    );
    assert.equal(second.noOp, true);
    assert.equal(second.importedIssueCount, 0);
    assert.equal(second.runId, first.runId);
  } finally {
    await database.close();
  }
});
