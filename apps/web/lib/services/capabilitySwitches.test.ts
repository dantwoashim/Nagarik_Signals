import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { PGlite, type Transaction } from '@electric-sql/pglite';

import type { QueryExecutor } from '../db/query';
import {
  type CapabilityCeilings,
  CapabilitySwitchError,
  changeCapabilitySwitch,
  parseCapabilitySwitchInput,
} from './capabilitySwitches';

const operatorId = '20000000-0000-4000-8000-000000000002';
const correlationKey = 'capability-switch-correlation-key-material-01';
const ceilings: CapabilityCeilings = {
  publicReadEnabled: true,
  publicMediaEnabled: true,
  inviteIntakeEnabled: true,
  inviteSignalsEnabled: true,
  operatorMutationsEnabled: true,
  publicationEnabled: true,
  v2WritesEnabled: true,
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
  await database.exec(`
    insert into nagarik.operator_profiles(auth_subject, display_name)
    values ('${operatorId}', 'System administrator');
  `);
}

test('system capability changes are versioned, audited, and replay safe', async () => {
  const database = new PGlite();
  const transaction = <T>(operation: (query: QueryExecutor) => Promise<T>) =>
    database.transaction((active) => operation(executor(active)));
  const dependencies = {
    transaction,
    correlationKey,
    ceilings,
    now: () => new Date('2030-01-01T00:00:00.000Z'),
  };
  try {
    await applySchema(database);
    const change = parseCapabilitySwitchInput({
      schemaVersion: 'capability-switch-v1',
      disabled: false,
      expectedVersion: 1,
      reason: 'Enable invited intake after readiness checks',
    });
    const input = {
      capability: 'inviteIntakeEnabled' as const,
      change,
      idempotencyKey: '40000000-0000-4000-8000-000000000004',
      actorSubjectId: operatorId,
    };

    const result = await changeCapabilitySwitch(input, dependencies);
    assert.deepEqual(
      { disabled: result.disabled, version: result.version, changed: result.changed },
      { disabled: false, version: 2, changed: true },
    );
    const replay = await changeCapabilitySwitch(input, dependencies);
    assert.equal(replay.replayed, true);
    assert.equal(replay.version, 2);

    await assert.rejects(
      changeCapabilitySwitch(
        {
          ...input,
          idempotencyKey: '50000000-0000-4000-8000-000000000005',
        },
        dependencies,
      ),
      (error: unknown) =>
        error instanceof CapabilitySwitchError && error.code === 'capability_switch_stale',
    );
    await assert.rejects(
      changeCapabilitySwitch(
        {
          ...input,
          capability: 'publicReadEnabled',
          idempotencyKey: '60000000-0000-4000-8000-000000000006',
        },
        dependencies,
      ),
      (error: unknown) =>
        error instanceof CapabilitySwitchError && error.code === 'cache_purge_evidence_required',
    );
    const publicRead = await changeCapabilitySwitch(
      {
        ...input,
        capability: 'publicReadEnabled',
        idempotencyKey: '80000000-0000-4000-8000-000000000008',
        change: parseCapabilitySwitchInput({
          ...change,
          cachePurgeReference: 'vercel-purge:2030-01-01T00:00:00Z',
        }),
      },
      dependencies,
    );
    assert.equal(publicRead.version, 2);
    assert.equal(publicRead.disabled, false);
    await assert.rejects(
      changeCapabilitySwitch(
        {
          ...input,
          capability: 'v2WritesEnabled',
          idempotencyKey: '70000000-0000-4000-8000-000000000007',
        },
        { ...dependencies, ceilings: { ...ceilings, v2WritesEnabled: false } },
      ),
      (error: unknown) =>
        error instanceof CapabilitySwitchError && error.code === 'capability_ceiling_disabled',
    );

    const query = executor(database);
    const audit = await query.query(
      `select action, detail from nagarik.audit_events where resource_type = 'capability_switch'`,
    );
    assert.equal(audit.length, 2);
    assert.equal(audit[0].action, 'capability_enabled');
    assert.equal((audit[0].detail as Record<string, unknown>).version, 2);
  } finally {
    await database.close();
  }
});
