import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { PGlite, type Transaction } from '@electric-sql/pglite';

import type { QueryExecutor } from '../db/query';
import type { IntakeCapability } from '../security/intakeCapabilityCore';

import { createStagedUpload, UploadTransactionError } from './uploads';

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
  for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
    await database.exec(await readFile(path.join(directory, name), 'utf8'));
  }
}

function executor(transaction: Transaction): QueryExecutor {
  return {
    async query(statement, parameters = []) {
      const result = await transaction.query<Record<string, unknown>>(statement, [
        ...parameters,
      ] as never[]);
      return result.rows;
    },
  };
}

test('private upload commits once, replays deterministically, and stores no raw receipt', async () => {
  const database = new PGlite();
  const organizationId = '10000000-0000-4000-8000-000000000001';
  const intake: IntakeCapability = {
    organizationId,
    capabilityId: '20000000-0000-4000-8000-000000000002',
    subjectId: '30000000-0000-4000-8000-000000000003',
    issuanceIdempotencyId: '40000000-0000-4000-8000-000000000004',
    keyVersion: 1,
    expiresAt: new Date('2030-01-02T00:00:00.000Z'),
    pilotPolicyVersion: 'pilot-v1',
  };
  const keys = {
    derivationKey: 'derivation-key-material-32-bytes-minimum',
    verifierKey: 'verifier-key-material-is-independent-32',
  };
  let stagedCount = 0;
  let removedCount = 0;
  const dependencies = {
    async stage() {
      stagedCount += 1;
      return {
        storageKey: `staging/local/${stagedCount}/private.jpg`,
        storageMode: 'local' as const,
      };
    },
    async remove() {
      removedCount += 1;
    },
    transaction: <T>(operation: (query: QueryExecutor) => Promise<T>) =>
      database.transaction((transaction) => operation(executor(transaction))),
    keys,
    correlationKey: 'security-correlation-key-material-32-bytes',
    now: () => new Date('2030-01-01T00:00:00.000Z'),
  };
  const normalized = {
    normalizationVersion: 'image-v2' as const,
    mediaType: 'image/jpeg' as const,
    extension: 'jpg' as const,
    sanitizedSize: 3,
    width: 1,
    height: 1,
    bytes: Buffer.from([1, 2, 3]),
    evidenceHash: '11'.repeat(32),
  };
  const idempotencyKey = '50000000-0000-4000-8000-000000000005';

  try {
    await applySchema(database);
    await database.exec(`
      insert into nagarik.organizations(id, slug, name)
      values ('${organizationId}', 'upload-test', 'Upload test');
    `);

    const first = await createStagedUpload({ intake, idempotencyKey, normalized }, dependencies);
    assert.equal(first.replayed, false);
    assert.match(first.receipt, /^nmr\.1\./);

    const replay = await createStagedUpload({ intake, idempotencyKey, normalized }, dependencies);
    assert.equal(replay.replayed, true);
    assert.equal(replay.receipt, first.receipt);
    assert.equal(replay.mediaId, first.mediaId);
    assert.equal(removedCount, 1);

    const media = await database.query<{ count: number }>(
      'select count(*)::integer as count from nagarik.media_objects',
    );
    const receipts = await database.query<{ count: number }>(
      'select count(*)::integer as count from nagarik.capabilities where purpose = 6',
    );
    const storedResponses = await database.query<{ response_body: unknown }>(
      'select response_body from nagarik.idempotency_records',
    );
    assert.equal(media.rows[0].count, 1);
    assert.equal(receipts.rows[0].count, 1);
    assert.equal(JSON.stringify(storedResponses.rows).includes(first.receipt), false);
    assert.equal(
      JSON.stringify(storedResponses.rows).includes(first.receipt.split('.').at(-1)!),
      false,
    );

    await assert.rejects(
      createStagedUpload(
        {
          intake,
          idempotencyKey,
          normalized: { ...normalized, evidenceHash: '22'.repeat(32) },
        },
        dependencies,
      ),
      (error: unknown) =>
        error instanceof UploadTransactionError && error.code === 'idempotency_key_reused',
    );
    assert.equal(removedCount, 2);
  } finally {
    await database.close();
  }
});
