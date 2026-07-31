import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { PGlite, type Transaction } from '@electric-sql/pglite';

import type { QueryExecutor } from '../db/query';
import { sweepExpiredMedia } from './mediaRetention';

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
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  const directory = path.resolve('supabase', 'migrations');
  for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
    await database.exec(await readFile(path.join(directory, name), 'utf8'));
  }
}

test('retention deletes only expired private objects and records an audit trail', async () => {
  const database = new PGlite();
  const organizationId = '10000000-0000-4000-8000-000000000001';
  const objects = new Set([
    'staging/local/one.jpg',
    'private/local/two.jpg',
    'private/local/three.jpg',
    'private/local/public.jpg',
  ]);
  const query = executor(database);
  const transaction = <T>(operation: (active: QueryExecutor) => Promise<T>) =>
    database.transaction((active) => operation(executor(active)));
  try {
    await applySchema(database);
    await database.exec(`
      insert into nagarik.organizations(id, slug, name)
      values ('${organizationId}', 'retention-test', 'Retention test');

      insert into nagarik.media_objects(
        id, organization_id, state, purpose, storage_class, storage_key, mime_type,
        normalization_version, sha256, byte_length, width, height, expires_at
      )
      values
        ('20000000-0000-4000-8000-000000000002', '${organizationId}', 'staged',
         'evidence', 'staging_private', 'staging/local/one.jpg', 'image/jpeg',
         'image-v2', decode(repeat('11', 32), 'hex'), 3, 1, 1, '2029-12-31'),
        ('30000000-0000-4000-8000-000000000003', '${organizationId}', 'approved_private',
         'evidence', 'durable_private', 'private/local/two.jpg', 'image/jpeg',
         'image-v2', decode(repeat('22', 32), 'hex'), 3, 1, 1, '2029-12-31'),
        ('40000000-0000-4000-8000-000000000004', '${organizationId}', 'approved_private',
         'evidence', 'durable_private', 'private/local/three.jpg', 'image/jpeg',
         'image-v2', decode(repeat('33', 32), 'hex'), 3, 1, 1, '2030-01-02'),
        ('50000000-0000-4000-8000-000000000005', '${organizationId}', 'approved_public',
         'public_derivative', 'durable_private', 'private/local/public.jpg', 'image/jpeg',
         'image-v2', decode(repeat('44', 32), 'hex'), 3, 1, 1, '2029-12-31');
    `);

    const dependencies = {
      query,
      transaction,
      async remove(object: { storageKey: string }) {
        objects.delete(object.storageKey);
      },
      storageMode: 'local' as const,
      correlationKey: 'security-correlation-key-material-32-bytes',
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    };
    assert.deepEqual(await sweepExpiredMedia(dependencies), {
      inspected: 2,
      deleted: 2,
      failed: 0,
      skipped: 0,
    });
    assert.deepEqual(await sweepExpiredMedia(dependencies), {
      inspected: 0,
      deleted: 0,
      failed: 0,
      skipped: 0,
    });

    const state = await database.query<{ state: string; count: number }>(`
      select state, count(*)::integer
      from nagarik.media_objects
      group by state
      order by state
    `);
    assert.deepEqual(state.rows, [
      { state: 'approved_private', count: 1 },
      { state: 'approved_public', count: 1 },
      { state: 'deleted', count: 2 },
    ]);
    assert.equal((await database.query('select 1 from nagarik.audit_events')).rows.length, 2);
    assert.equal(objects.has('staging/local/one.jpg'), false);
    assert.equal(objects.has('private/local/two.jpg'), false);
    assert.equal(objects.has('private/local/three.jpg'), true);
    assert.equal(objects.has('private/local/public.jpg'), true);
  } finally {
    await database.close();
  }
});
