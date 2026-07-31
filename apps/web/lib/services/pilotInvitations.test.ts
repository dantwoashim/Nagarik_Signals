import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { PGlite, type Transaction } from '@electric-sql/pglite';

import type { QueryExecutor } from '../db/query';
import { authorizeIntakeCapability } from '../security/intakeCapabilityCore';
import { authorizeSignalCapability } from '../security/signalCapabilityCore';
import {
  consumePilotInvitation,
  createPilotInvitation,
  parseIntakeSessionInput,
  parsePilotInvitationInput,
  PilotInvitationError,
} from './pilotInvitations';

const organizationId = '10000000-0000-4000-8000-000000000001';
const operatorId = '20000000-0000-4000-8000-000000000002';
const keys = {
  derivationKey: 'pilot-invitation-derivation-key-material-001',
  verifierKey: 'pilot-invitation-verifier-key-material-0002',
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

test('a curated invitation creates bounded purpose-separated pilot capabilities once', async () => {
  const database = new PGlite();
  const query = executor(database);
  const transaction = <T>(operation: (active: QueryExecutor) => Promise<T>) =>
    database.transaction((active) => operation(executor(active)));
  const now = () => new Date('2030-01-01T00:00:00.000Z');
  const common = {
    transaction,
    keys,
    correlationKey: 'pilot-invitation-correlation-key-material-01',
    now,
  };

  try {
    await applySchema(database);
    await database.exec(`
      insert into nagarik.organizations(id, slug, name)
      values ('${organizationId}', 'pilot-test', 'Pilot test');

      insert into nagarik.operator_profiles(auth_subject, display_name)
      values ('${operatorId}', 'Pilot administrator');

      insert into nagarik.pilot_policies(
        id, organization_id, version, state, boundary_version,
        ward_geometry_version, boundary_geojson, invitation_scope,
        created_by, activated_at
      )
      values (
        '30000000-0000-4000-8000-000000000003',
        '${organizationId}', 1, 'active', 'pilot-boundary-2030-01',
        'wards-2030-01', '{"type":"Polygon","coordinates":[]}'::jsonb,
        array['intake', 'signal'], '${operatorId}', now()
      );

      update nagarik.capability_kill_switches
      set disabled = false, reason = 'pilot_test'
      where capability in (
        'operatorMutationsEnabled', 'inviteIntakeEnabled', 'inviteSignalsEnabled'
      );
    `);

    const invitationInput = {
      idempotencyKey: '40000000-0000-4000-8000-000000000004',
      actor: { subjectId: operatorId, organizationId },
      invitation: parsePilotInvitationInput({
        schemaVersion: 'pilot-invitation-create-v1',
        scopes: ['signal', 'intake'],
        expiresAt: '2030-01-07T00:00:00.000Z',
        pilotPolicyVersion: 'pilot-boundary-2030-01',
      }),
    };
    const invitation = await createPilotInvitation(invitationInput, common);
    assert.equal(invitation.replayed, false);
    assert.match(invitation.invitation, /^npi\.1\./);
    assert.deepEqual(invitation.scopes, ['intake', 'signal']);
    const invitationReplay = await createPilotInvitation(invitationInput, common);
    assert.equal(invitationReplay.replayed, true);
    assert.equal(invitationReplay.invitation, invitation.invitation);

    const sessionInput = {
      idempotencyKey: '50000000-0000-4000-8000-000000000005',
      session: parseIntakeSessionInput({
        schemaVersion: 'pilot-invitation-v1',
        invitation: invitation.invitation,
      }),
    };
    const session = await consumePilotInvitation(sessionInput, common);
    assert.equal(session.replayed, false);
    assert.deepEqual(session.scopes, ['intake', 'signal']);
    assert.match(session.intakeToken!, /^npc\.1\./);
    assert.match(session.signalToken!, /^nsg\.1\./);

    const sessionReplay = await consumePilotInvitation(sessionInput, common);
    assert.equal(sessionReplay.replayed, true);
    assert.equal(sessionReplay.intakeToken, session.intakeToken);
    assert.equal(sessionReplay.signalToken, session.signalToken);

    const rows = await query.query(
      `select
         capability.id,
         capability.organization_id,
         capability.subject_id,
         capability.issuance_idempotency_id,
         capability.key_version,
         capability.verifier,
         capability.state,
         capability.scope,
         capability.expires_at,
         capability.purpose,
         invitation.state as invitation_state
       from nagarik.capabilities capability
       join nagarik.pilot_invitations invitation on invitation.id = capability.subject_id
       where capability.purpose in (2, 3)
       order by capability.purpose`,
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].invitation_state, 'consumed');
    assert.ok(
      authorizeIntakeCapability(
        session.intakeToken!,
        {
          keyVersion: Number(rows[0].key_version),
          purpose: 'pilot_intake',
          organizationId: String(rows[0].organization_id),
          capabilityId: String(rows[0].id),
          subjectId: String(rows[0].subject_id),
          issuanceIdempotencyId: String(rows[0].issuance_idempotency_id),
          verifier: rows[0].verifier as Uint8Array,
          state: String(rows[0].state) as 'active',
          expiresAt: new Date(String(rows[0].expires_at)),
          scope: rows[0].scope,
        },
        keys,
        now(),
      ),
    );
    assert.ok(
      authorizeSignalCapability(
        session.signalToken!,
        {
          keyVersion: Number(rows[1].key_version),
          purpose: 'pilot_signal',
          organizationId: String(rows[1].organization_id),
          capabilityId: String(rows[1].id),
          subjectId: String(rows[1].subject_id),
          issuanceIdempotencyId: String(rows[1].issuance_idempotency_id),
          verifier: rows[1].verifier as Uint8Array,
          state: String(rows[1].state) as 'active',
          expiresAt: new Date(String(rows[1].expires_at)),
          scope: rows[1].scope,
        },
        keys,
        now(),
      ),
    );

    const persisted = JSON.stringify(
      await query.query(
        `select scope, encode(verifier, 'hex') as verifier
         from nagarik.capabilities
         order by purpose`,
      ),
    );
    assert.equal(persisted.includes(invitation.invitation), false);
    assert.equal(persisted.includes(session.intakeToken!), false);
    assert.equal(persisted.includes(session.signalToken!), false);

    await assert.rejects(
      consumePilotInvitation(
        {
          ...sessionInput,
          idempotencyKey: '60000000-0000-4000-8000-000000000006',
        },
        common,
      ),
      (error: unknown) =>
        error instanceof PilotInvitationError && error.code === 'pilot_invitation_unavailable',
    );
  } finally {
    await database.close();
  }
});
