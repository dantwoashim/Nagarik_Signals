import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { PGlite, type Transaction } from '@electric-sql/pglite';

import type { QueryExecutor } from '../db/query';
import type { IntakeCapability } from '../security/intakeCapabilityCore';
import { processMediaPromotion } from './mediaPromotion';
import { createStagedUpload } from './uploads';
import { parseSubmissionInput } from './submissionInput';
import { createPrivateSubmission, SubmissionTransactionError } from './submissions';

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

test('submission remains private while media promotion and tracking are committed atomically', async () => {
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
  const transaction = <T>(operation: (query: QueryExecutor) => Promise<T>) =>
    database.transaction((active) => operation(executor(active)));
  const now = () => new Date('2030-01-01T00:00:00.000Z');
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();

  try {
    await applySchema(database);
    await database.exec(`
      insert into nagarik.organizations(id, slug, name)
      values ('${organizationId}', 'submission-test', 'Submission test');

      insert into nagarik.operator_profiles(auth_subject, display_name)
      values ('90000000-0000-4000-8000-000000000009', 'Policy owner');

      insert into nagarik.pilot_policies(
        id,
        organization_id,
        version,
        state,
        boundary_version,
        ward_geometry_version,
        boundary_geojson,
        invitation_scope,
        created_by,
        activated_at
      )
      values (
        '91000000-0000-4000-8000-000000000009',
        '${organizationId}',
        1,
        'active',
        'pilot-v1',
        'wards-v1',
        '{
          "type":"FeatureCollection",
          "features":[
            {
              "type":"Feature",
              "properties":{"kind":"pilot"},
              "geometry":{"type":"Polygon","coordinates":[[[85.2,27.6],[85.5,27.6],[85.5,27.9],[85.2,27.9],[85.2,27.6]]]}
            },
            {
              "type":"Feature",
              "properties":{"kind":"ward","wardId":"ward-1"},
              "geometry":{"type":"Polygon","coordinates":[[[85.3,27.65],[85.4,27.65],[85.4,27.75],[85.3,27.75],[85.3,27.65]]]}
            }
          ]
        }'::jsonb,
        array['intake'],
        '90000000-0000-4000-8000-000000000009',
        now()
      );
    `);

    const upload = await createStagedUpload(
      {
        intake,
        idempotencyKey: '50000000-0000-4000-8000-000000000005',
        normalized: {
          normalizationVersion: 'image-v2',
          mediaType: 'image/jpeg',
          extension: 'jpg',
          sanitizedSize: 3,
          width: 1,
          height: 1,
          bytes: Buffer.from([1, 2, 3]),
          evidenceHash: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
        },
      },
      {
        async stage() {
          objects.set('staging/local/private/evidence.jpg', {
            bytes: Buffer.from([1, 2, 3]),
            contentType: 'image/jpeg',
          });
          return {
            storageKey: 'staging/local/private/evidence.jpg',
            storageMode: 'local',
          };
        },
        async remove() {},
        transaction,
        keys,
        correlationKey: 'security-correlation-key-material-32-bytes',
        now,
      },
    );
    const submission = parseSubmissionInput(
      {
        schemaVersion: 'submission-v2',
        title: 'Loose drain cover beside a public walkway',
        description: 'The cover is displaced and leaves an opening beside the pedestrian path.',
        category: 'water',
        observedOn: '2029-12-31',
        mediaReceipt: upload.receipt,
        location: {
          latitudeE6: 27_700_123,
          longitudeE6: 85_350_456,
          wardId: 'ward-1',
          geometryVersion: 'wards-v1',
          localityLabel: 'Central walkway',
        },
        acknowledgements: {
          publicInfrastructureOnly: true,
          nonEmergency: true,
          publicationAfterReview: true,
        },
      },
      '2030-01-01',
    );
    const idempotencyKey = '60000000-0000-4000-8000-000000000006';
    const dependencies = {
      transaction,
      keys,
      correlationKey: 'security-correlation-key-material-32-bytes',
      durablePrefix: 'private/local/',
      now,
    };

    const first = await createPrivateSubmission(
      { intake, idempotencyKey, submission },
      dependencies,
    );
    assert.equal(first.replayed, false);
    assert.equal(first.state, 'received');
    assert.equal(first.media.state, 'promotion_pending');
    assert.match(first.recoveryToken, /^nsc\.1\./);

    const replay = await createPrivateSubmission(
      { intake, idempotencyKey, submission },
      dependencies,
    );
    assert.equal(replay.replayed, true);
    assert.equal(replay.recoveryToken, first.recoveryToken);
    assert.equal(replay.trackingId, first.trackingId);

    const counts = await database.query<{
      submissions: number;
      issues: number;
      projections: number;
      outbox: number;
      tracking: number;
    }>(`
      select
        (select count(*)::integer from nagarik.submissions) as submissions,
        (select count(*)::integer from nagarik.issues) as issues,
        (select count(*)::integer from public.issue_projection) as projections,
        (select count(*)::integer from nagarik.outbox_jobs) as outbox,
        (select count(*)::integer from nagarik.capabilities where purpose = 4) as tracking
    `);
    assert.deepEqual(counts.rows[0], {
      submissions: 1,
      issues: 0,
      projections: 0,
      outbox: 1,
      tracking: 1,
    });

    const state = await database.query<{
      media_state: string;
      receipt_state: string;
      operation_type: string;
    }>(`
      select
        media.state as media_state,
        receipt.state as receipt_state,
        job.operation_type
      from nagarik.media_objects media
      join nagarik.capabilities receipt on receipt.subject_id = media.id and receipt.purpose = 6
      join nagarik.outbox_jobs job on job.organization_id = media.organization_id
    `);
    assert.deepEqual(state.rows[0], {
      media_state: 'promotion_pending',
      receipt_state: 'consumed',
      operation_type: 'media_promote',
    });

    const persisted = await database.query<{ payload: string }>(`
      select (
        coalesce(string_agg(response_body::text, ''), '') ||
        coalesce((select string_agg(scope::text, '') from nagarik.capabilities), '')
      ) as payload
      from nagarik.idempotency_records
    `);
    assert.equal(persisted.rows[0].payload.includes(first.recoveryToken), false);
    assert.equal(persisted.rows[0].payload.includes(first.recoveryToken.split('.').at(-1)!), false);

    await assert.rejects(
      createPrivateSubmission(
        {
          intake,
          idempotencyKey: '70000000-0000-4000-8000-000000000007',
          submission,
        },
        dependencies,
      ),
      (error: unknown) =>
        error instanceof SubmissionTransactionError && error.code === 'media_receipt_consumed',
    );

    await database.exec(
      "update nagarik.outbox_jobs set available_at = now() - interval '1 second'",
    );
    const claimed = await database.query<{
      id: string;
      lease_owner: string;
      attempt_count: number;
      canonical_payload: unknown;
      payload_hash: Uint8Array;
    }>("select * from nagarik.claim_outbox_jobs('media-test-worker', 10, 60)");
    assert.equal(claimed.rows.length, 1);
    const job = claimed.rows[0];
    assert.equal(
      await processMediaPromotion(
        {
          id: job.id,
          leaseOwner: job.lease_owner,
          attemptNumber: job.attempt_count,
          canonicalPayload: job.canonical_payload,
          payloadHash: Buffer.from(job.payload_hash).toString('hex'),
        },
        {
          async read(storageKey) {
            const object = objects.get(storageKey);
            if (!object) throw new Error('missing');
            return { bytes: Buffer.from(object.bytes), contentType: object.contentType };
          },
          async write({ storageKey, bytes, contentType }) {
            if (objects.has(storageKey)) throw new Error('exists');
            objects.set(storageKey, { bytes: Buffer.from(bytes), contentType });
            return { storageKey, storageMode: 'local' };
          },
          async remove(object) {
            objects.delete(object.storageKey);
          },
          transaction,
          storageMode: 'local',
          retentionDays: 90,
          now,
        },
      ),
      'confirmed',
    );
    const promoted = await database.query<{
      media_state: string;
      storage_class: string;
      job_state: string;
      attempts: number;
    }>(`
      select
        media.state as media_state,
        media.storage_class,
        job.state as job_state,
        (select count(*)::integer from nagarik.outbox_attempts) as attempts
      from nagarik.media_objects media
      join nagarik.outbox_jobs job on job.organization_id = media.organization_id
    `);
    assert.deepEqual(promoted.rows[0], {
      media_state: 'quarantined',
      storage_class: 'durable_private',
      job_state: 'confirmed',
      attempts: 1,
    });
    assert.equal(objects.has('staging/local/private/evidence.jpg'), false);
    assert.equal(
      [...objects.keys()].some((storageKey) => storageKey.startsWith('private/local/')),
      true,
    );
  } finally {
    await database.close();
  }
});
