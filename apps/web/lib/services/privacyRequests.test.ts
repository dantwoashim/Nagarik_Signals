import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { PGlite, type Transaction } from '@electric-sql/pglite';

import type { QueryExecutor } from '../db/query';
import {
  deriveCapabilityMaterial,
  parseCapabilityToken,
  type CapabilityCoordinates,
} from '../security/capabilityTokens';
import { authorizePrivacyTrackingCapability } from '../security/privacyTrackingCore';
import {
  createPrivacyRequest,
  parsePrivacyRequestInput,
  PrivacyRequestError,
} from './privacyRequests';

const organizationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000002';
const trackingId = '30000000-0000-4000-8000-000000000003';
const trackingCapabilityId = '40000000-0000-4000-8000-000000000004';
const trackingIssuanceId = '50000000-0000-4000-8000-000000000005';
const intakeCapabilityId = '60000000-0000-4000-8000-000000000006';
const keys = {
  derivationKey: 'privacy-test-derivation-key-material-0000001',
  verifierKey: 'privacy-test-verifier-key-material-000000002',
};
const correlationKey = 'privacy-test-correlation-key-material-000001';

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

function trackingCoordinates(): CapabilityCoordinates {
  return {
    keyVersion: 1,
    purpose: 'submission_tracking',
    organizationId,
    capabilityId: trackingCapabilityId,
    subjectId: submissionId,
    issuanceIdempotencyId: trackingIssuanceId,
  };
}

test('privacy request input rejects caller organization fields and malformed private text', () => {
  const valid = {
    schemaVersion: 'privacy-request-v1',
    target: { type: 'public_issue', id: '6f62862a-c3d3-4758-bd40-3012ab63ab86' },
    requestType: 'media_restriction',
    description: 'The published image may contain personal information.',
  };
  assert.deepEqual(parsePrivacyRequestInput(valid), valid);
  assert.throws(
    () => parsePrivacyRequestInput({ ...valid, organizationId }),
    (error: unknown) =>
      error instanceof PrivacyRequestError && error.code === 'privacy_request_invalid',
  );
  assert.throws(() => parsePrivacyRequestInput({ ...valid, description: 'too short' }));
  assert.throws(() =>
    parsePrivacyRequestInput({ ...valid, description: 'Private request with\u0000control data.' }),
  );
});

test('submission privacy requests bind organization and tracking capability exactly once', async () => {
  const database = new PGlite();
  const query = executor(database);
  const transaction = <T>(operation: (active: QueryExecutor) => Promise<T>) =>
    database.transaction((active) => operation(executor(active)));
  const now = () => new Date('2030-01-01T00:00:00.000Z');
  const tracking = deriveCapabilityMaterial(trackingCoordinates(), keys);
  try {
    await applySchema(database);
    await database.exec(`
      insert into nagarik.organizations(id, slug, name)
      values ('${organizationId}', 'privacy-test', 'Privacy test');

      insert into nagarik.submissions(
        id, tracking_id, organization_id, record_kind, state, received_at
      ) values (
        '${submissionId}', '${trackingId}', '${organizationId}',
        'community_report', 'received', '2030-01-01T00:00:00.000Z'
      );

      insert into nagarik.capabilities(
        id, organization_id, purpose, subject_id, issuance_idempotency_id,
        key_version, verifier, scope, expires_at, created_at
      ) values (
        '${trackingCapabilityId}', '${organizationId}', 4, '${submissionId}', '${trackingIssuanceId}',
        1, decode('${tracking.verifier.toString('hex')}', 'hex'),
        '{"submissionId":"${submissionId}","trackingId":"${trackingId}","actions":["read"]}'::jsonb,
        '2030-04-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z'
      );
    `);
    const privacyInput = parsePrivacyRequestInput({
      schemaVersion: 'privacy-request-v1',
      target: { type: 'submission', id: `trk_${trackingId}` },
      requestType: 'access',
      description: 'Please provide the private information linked to this report.',
    });
    const request = {
      intake: {
        organizationId,
        capabilityId: intakeCapabilityId,
        subjectId: '70000000-0000-4000-8000-000000000007',
        issuanceIdempotencyId: '80000000-0000-4000-8000-000000000008',
        keyVersion: 1,
        expiresAt: new Date('2030-04-01T00:00:00.000Z'),
        pilotPolicyVersion: 'pilot-v1',
      },
      idempotencyKey: '90000000-0000-4000-8000-000000000009',
      request: privacyInput,
      submissionTrackingToken: tracking.token,
    };
    const dependencies = { transaction, keys, correlationKey, now };

    const created = await createPrivacyRequest(request, dependencies);
    assert.equal(created.replayed, false);
    assert.equal(created.state, 'received');
    assert.match(created.recoveryToken, /^npr\.1\./);

    const rows = await query.query(
      `select
         request.id, request.organization_id, request.target_id, request.tracking_capability_id,
         capability.subject_id, capability.issuance_idempotency_id,
         capability.key_version, capability.verifier, capability.state,
         capability.scope, capability.expires_at,
         (select count(*)::integer from nagarik.privacy_request_events) as event_count,
         (select count(*)::integer from nagarik.audit_events) as audit_count
       from nagarik.privacy_requests request
       join nagarik.capabilities capability on capability.id = request.tracking_capability_id`,
    );
    const row = rows[0];
    assert.equal(row.organization_id, organizationId);
    assert.equal(row.target_id, submissionId);
    assert.equal(row.event_count, 1);
    assert.equal(row.audit_count, 1);
    const parsed = parseCapabilityToken(created.recoveryToken);
    assert.ok(parsed);
    assert.equal(
      authorizePrivacyTrackingCapability(
        created.recoveryToken,
        {
          keyVersion: Number(row.key_version),
          purpose: 'privacy_tracking',
          organizationId: String(row.organization_id),
          capabilityId: String(row.tracking_capability_id),
          subjectId: String(row.subject_id),
          issuanceIdempotencyId: String(row.issuance_idempotency_id),
          verifier: row.verifier as Uint8Array,
          state: String(row.state),
          expiresAt: new Date(String(row.expires_at)),
          scope: row.scope,
        },
        {
          privacyRequestId: created.privacyRequestId,
          organizationId,
          action: 'read',
        },
        keys,
        now(),
      ),
      true,
    );

    const replay = await createPrivacyRequest(request, dependencies);
    assert.equal(replay.replayed, true);
    assert.equal(replay.recoveryToken, created.recoveryToken);
    const counts = await query.query(
      `select
         (select count(*)::integer from nagarik.privacy_requests) as requests,
         (select count(*)::integer from nagarik.privacy_request_events) as events`,
    );
    assert.deepEqual(counts[0], { requests: 1, events: 1 });

    await assert.rejects(
      () =>
        createPrivacyRequest(
          {
            ...request,
            request: { ...privacyInput, requestType: 'erasure' },
          },
          dependencies,
        ),
      (error: unknown) =>
        error instanceof PrivacyRequestError && error.code === 'idempotency_key_reused',
    );
    await assert.rejects(
      () =>
        createPrivacyRequest(
          {
            ...request,
            idempotencyKey: 'a0000000-0000-4000-8000-00000000000a',
            submissionTrackingToken: null,
          },
          dependencies,
        ),
      (error: unknown) =>
        error instanceof PrivacyRequestError && error.code === 'privacy_request_unavailable',
    );
    await assert.rejects(
      () =>
        database.exec(
          `update nagarik.privacy_request_events set to_state = 'withdrawn' where privacy_request_id = '${created.privacyRequestId}'`,
        ),
      /privacy_request_event_append_only/,
    );
  } finally {
    await database.close();
  }
});
