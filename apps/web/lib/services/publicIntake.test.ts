import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { PGlite, type Transaction } from '@electric-sql/pglite';

import type { QueryExecutor } from '../db/query';
import {
  authorizeIntakeCapability,
  type IntakeCapabilityRow,
} from '../security/intakeCapabilityCore';
import { createPublicIntakeSession } from './publicIntake';

const keys = {
  derivationKey: 'public-intake-derivation-key-material-001',
  verifierKey: 'public-intake-verifier-key-material-0002',
};

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

test('public reporting creates one bounded intake capability per network and day', async () => {
  const database = new PGlite();
  const transaction = <T>(operation: (query: QueryExecutor) => Promise<T>) =>
    database.transaction((active) => operation(executor(active)));
  const now = () => new Date('2030-01-01T12:00:00.000Z');

  try {
    await applySchema(database);
    await database.exec(`
      update nagarik.capability_kill_switches
      set disabled = false
      where capability = 'inviteIntakeEnabled';
    `);

    const dependencies = { transaction, keys, now };
    const first = await createPublicIntakeSession({ actorKey: 'a'.repeat(64) }, dependencies);
    const replay = await createPublicIntakeSession({ actorKey: 'a'.repeat(64) }, dependencies);

    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(first.intakeToken, replay.intakeToken);
    assert.deepEqual(first.scopes, ['intake']);

    const result = await database.query<Record<string, unknown>>(
      `select * from nagarik.capabilities where purpose = 2`,
    );
    assert.equal(result.rows.length, 1);
    const raw = result.rows[0];
    const row: IntakeCapabilityRow = {
      keyVersion: Number(raw.key_version),
      purpose: 'pilot_intake',
      organizationId: String(raw.organization_id),
      capabilityId: String(raw.id),
      subjectId: String(raw.subject_id),
      issuanceIdempotencyId: String(raw.issuance_idempotency_id),
      verifier: raw.verifier as Uint8Array,
      state: raw.state as IntakeCapabilityRow['state'],
      expiresAt: new Date(String(raw.expires_at)),
      scope: raw.scope,
    };
    assert.ok(authorizeIntakeCapability(first.intakeToken, row, keys, now()));
  } finally {
    await database.close();
  }
});
