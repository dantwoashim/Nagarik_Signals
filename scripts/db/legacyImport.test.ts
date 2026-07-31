import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';

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

function adapter(queryable: PGlite): LegacyImportQuery {
  return {
    async query(statement, parameters = []) {
      const result = await queryable.query<Record<string, unknown>>(statement, [
        ...parameters,
      ] as never[]);
      return result.rows;
    },
  };
}

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
    assert.equal(issueCount.rows[0].count, 4);
    assert.equal(projectionCount.rows[0].count, 4);

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
