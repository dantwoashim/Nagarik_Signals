import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';

import {
  applyLegacyImport,
  deterministicUuid,
  prepareLegacyImport,
  type LegacyImportQuery,
} from './db/legacyImport';

function literal(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non_finite_sql_parameter');
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
  throw new Error(`unsupported_sql_parameter:${typeof value}`);
}

function bind(statement: string, parameters: readonly unknown[]): string {
  return statement.replace(/\$(\d+)/g, (_match, index: string) => {
    const position = Number(index) - 1;
    if (position < 0 || position >= parameters.length) {
      throw new Error(`missing_sql_parameter:${index}`);
    }
    return literal(parameters[position]);
  });
}

async function renderImportSql() {
  const sourcePath = path.resolve('data', 'read-model', 'nagarik-signal.json');
  const plan = prepareLegacyImport(await readFile(sourcePath, 'utf8'));
  const organizationId = deterministicUuid('nagarik:organization:v1', 'public-source-curation');
  const statements: string[] = [];
  const recorder: LegacyImportQuery = {
    async query(statement, parameters = []) {
      if (statement.includes('from nagarik.organizations')) return [{ id: organizationId }];
      if (statement.includes('from nagarik.legacy_import_runs')) return [];
      statements.push(`${bind(statement.trim(), parameters)};`);
      return [];
    },
  };
  await applyLegacyImport(recorder, plan, organizationId);

  return [
    'begin;',
    `insert into nagarik.organizations(id, slug, name) values (${literal(organizationId)}::uuid, 'public-source-curation', 'Public source curation') on conflict (id) do nothing;`,
    'do $nagarik_legacy_import$',
    'begin',
    `  if not exists (select 1 from nagarik.legacy_import_runs where source_sha256 = decode(${literal(plan.canonicalSourceSha256)}, 'hex') and mode = 'commit' and state = 'completed') then`,
    ...statements.map((statement) => statement.split('\n').map((line) => `    ${line}`).join('\n')),
    '  end if;',
    'end',
    '$nagarik_legacy_import$;',
    'commit;',
    '',
  ].join('\n');
}

async function verifyImportSql(sql: string) {
  const database = new PGlite();
  try {
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
    const migrations = (await readdir(path.resolve('supabase', 'migrations')))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const migration of migrations) {
      await database.exec(await readFile(path.resolve('supabase', 'migrations', migration), 'utf8'));
    }
    await database.exec(sql);
    const result = await database.query<{
      issues: number;
      proofs: number;
      events: number;
    }>(`
      select
        (select count(*) from public.issue_projection)::integer as issues,
        (select count(*) from public.proof_projection)::integer as proofs,
        (select count(*) from public.event_projection)::integer as events
    `);
    return result.rows[0];
  } finally {
    await database.close();
  }
}

async function main() {
  const sql = await renderImportSql();
  if (process.argv.includes('--verify')) {
    process.stdout.write(`${JSON.stringify(await verifyImportSql(sql))}\n`);
    return;
  }
  process.stdout.write(sql);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
