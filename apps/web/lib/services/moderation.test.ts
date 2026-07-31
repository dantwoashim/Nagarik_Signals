import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { PGlite, type Transaction } from '@electric-sql/pglite';
import sharp from 'sharp';

import { createObservedEvent, processChainOutboxBatch } from '../chain/outboxWorker';
import type { ChainSigner, ObservedCommitmentEvent } from '../chain/signer';
import type { QueryExecutor } from '../db/query';
import type { PrivateStagedObject } from '../storage/privateStorage';
import {
  issueMediaBindingReceipt,
  parseMediaBindingInput,
  parseMediaReviewInput,
  parsePublicDerivativeInput,
  createPublicDerivative,
  reviewPrivateMedia,
} from './mediaWorkflow';
import { V2_PROGRAM_ID } from '../solana/v2/protocol';
import { recordIssueHandoff, parseHandoffInput } from './handoffs';
import { moderateSubmission, parseModerationInput } from './moderation';
import {
  correctPublishedIssue,
  parseCorrectionInput,
  parseRemovalInput,
  removePublishedIssue,
} from './publication';
import { recordPublicSignal, retractPublicSignal } from './signals';
import { changeIssueLifecycle, parseLifecycleInput } from './status';

const organizationId = '10000000-0000-4000-8000-000000000001';
const operatorId = '20000000-0000-4000-8000-000000000002';
const submissionId = '30000000-0000-4000-8000-000000000003';
const revisionId = '40000000-0000-4000-8000-000000000004';
const mediaId = '50000000-0000-4000-8000-000000000005';
const capabilityKeys = {
  derivationKey: 'moderation-test-derivation-key-material-0001',
  verifierKey: 'moderation-test-verifier-key-material-000002',
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

test('approval stays private until exact v2 confirmation publishes the frozen projection', async () => {
  const database = new PGlite();
  const query = executor(database);
  const transaction = <T>(operation: (active: QueryExecutor) => Promise<T>) =>
    database.transaction((active) => operation(executor(active)));
  const now = () => new Date('2030-01-01T00:00:00.000Z');
  const signature = '2'.repeat(64);
  const sourceStorageKey = 'private/local/test/evidence.jpg';
  const sourceBytes = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 210, g: 205, b: 190 },
    },
  })
    .jpeg({
      quality: 82,
      chromaSubsampling: '4:2:0',
      progressive: true,
      optimizeCoding: true,
    })
    .toBuffer();
  const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
  const storage = new Map<string, { bytes: Buffer; contentType: 'image/jpeg' | 'image/webp' }>([
    [sourceStorageKey, { bytes: sourceBytes, contentType: 'image/jpeg' }],
  ]);
  const read = async (storageKey: string, maximumBytes = 6 * 1024 * 1024) => {
    const object = storage.get(storageKey);
    if (!object) throw new Error('private_object_missing');
    if (object.bytes.byteLength > maximumBytes) throw new Error('private_object_too_large');
    return { bytes: Buffer.from(object.bytes), contentType: object.contentType };
  };
  const write = async (input: {
    storageKey: string;
    bytes: Uint8Array;
    contentType: 'image/jpeg' | 'image/webp';
  }): Promise<PrivateStagedObject> => {
    if (storage.has(input.storageKey)) throw new Error('private_object_exists');
    storage.set(input.storageKey, {
      bytes: Buffer.from(input.bytes),
      contentType: input.contentType,
    });
    return { storageKey: input.storageKey, storageMode: 'local' };
  };
  const remove = async (object: PrivateStagedObject) => {
    storage.delete(object.storageKey);
  };

  try {
    await applySchema(database);
    await database.exec(`
      insert into nagarik.organizations(id, slug, name)
      values ('${organizationId}', 'moderation-test', 'Moderation test');

      insert into nagarik.operator_profiles(auth_subject, display_name)
      values ('${operatorId}', 'Test moderator');

      update nagarik.capability_kill_switches
      set disabled = false, reason = 'workflow_test'
      where capability in (
        'operatorMutationsEnabled',
        'publicationEnabled',
        'v2WritesEnabled',
        'publicReadEnabled',
        'publicMediaEnabled',
        'inviteSignalsEnabled'
      );

      insert into nagarik.media_objects(
        id, organization_id, state, purpose, storage_class, storage_key,
        mime_type, normalization_version, sha256, byte_length, width, height
      )
      values (
        '${mediaId}', '${organizationId}', 'quarantined', 'submission',
        'durable_private', '${sourceStorageKey}',
        'image/jpeg', 'image-v2', decode('${sourceHash}', 'hex'), ${sourceBytes.byteLength}, 800, 600
      );

      insert into nagarik.submissions(
        id, tracking_id, organization_id, record_kind, state,
        version, current_revision_number, received_at, first_review_at
      )
      values (
        '${submissionId}', '31000000-0000-4000-8000-000000000003',
        '${organizationId}', 'community_report', 'under_review',
        2, 1, now() - interval '1 hour', now() - interval '30 minutes'
      );

      insert into nagarik.submission_revisions(
        id, submission_id, revision_number, title, narrative, category,
        observed_on, lat_e3, lng_e3, ward_id, ward_geometry_version,
        locality_label, provenance_private
      )
      values (
        '${revisionId}', '${submissionId}', 1,
        'Loose drain cover beside a public walkway',
        'The cover is displaced and leaves an opening beside the pedestrian path.',
        'public_safety_hazard', date '2029-12-31', 27700, 85350,
        'KMC-01', 'wards-v1', 'Central walkway',
        '{
          "schemaVersion":"community-report-private-v1",
          "candidatePublicLocation":{
            "policyVersion":"grid-0.01deg-v1",
            "wardId":"KMC-01",
            "wardGeometryVersion":"wards-v1",
            "latIndex":11770,
            "lngIndex":26535,
            "coarseCellId":"g1-11770-26535",
            "centerLatE6":27705000,
            "centerLngE6":85355000,
            "uncertaintyRadiusM":800
          }
        }'::jsonb
      );

      insert into nagarik.submission_media(revision_id, media_id, position)
      values ('${revisionId}', '${mediaId}', 0);
    `);

    const actor = { subjectId: operatorId, organizationId };
    const workflowDependencies = {
      transaction,
      correlationKey: 'moderation-correlation-key-material-32-bytes',
      now,
    };
    const reviewed = await reviewPrivateMedia(
      {
        mediaId,
        idempotencyKey: '51000000-0000-4000-8000-000000000005',
        actor,
        review: parseMediaReviewInput({
          schemaVersion: 'operator-media-review-v1',
          expected: { version: 1, state: 'quarantined' },
          decision: 'approve_private',
          reasonCode: 'privacy_review_complete',
          privateNote: 'The source was checked before derivative rendering.',
        }),
      },
      workflowDependencies,
    );
    assert.equal(reviewed.state, 'approved_private');
    assert.equal(reviewed.version, 2);

    const derivative = await createPublicDerivative(
      {
        sourceMediaId: mediaId,
        idempotencyKey: '52000000-0000-4000-8000-000000000005',
        actor,
        derivative: parsePublicDerivativeInput({
          schemaVersion: 'public-derivative-v1',
          expected: { version: 2, state: 'approved_private' },
          reviewDecision: 'redact',
          rectangles: [
            {
              x: 100,
              y: 80,
              width: 220,
              height: 140,
              reasonCode: 'personal_detail',
            },
          ],
          privateNote: 'Reviewed rectangle covers the personal detail.',
        }),
      },
      {
        ...workflowDependencies,
        read,
        write,
        remove,
        storageMode: 'local',
        durablePrefix: 'private/local/',
      },
    );
    assert.equal(derivative.state, 'redacted_derivative');
    assert.notEqual(derivative.mediaId, mediaId);
    assert.notEqual(derivative.sha256, sourceHash);

    const binding = await issueMediaBindingReceipt(
      {
        mediaId: derivative.mediaId,
        idempotencyKey: '53000000-0000-4000-8000-000000000005',
        actor,
        binding: parseMediaBindingInput({
          schemaVersion: 'operator-media-binding-v1',
          expected: { version: 1, state: 'redacted_derivative' },
          binding: {
            purpose: 'initial_publication',
            targetType: 'submission',
            targetId: submissionId,
          },
        }),
      },
      { ...workflowDependencies, keys: capabilityKeys },
    );
    assert.match(binding.receipt, /^nomr\.1\./);

    const moderation = parseModerationInput({
      decision: 'approve',
      expectedVersion: 2,
      reasonCode: 'public_infrastructure_confirmed',
      privateNote: 'Image and location were reviewed for personal information.',
      publicSafeMessage: 'Reviewed for publication.',
      publicCopy: {
        title: 'Loose drain cover beside a public walkway',
        narrative:
          'A loose drain cover leaves a visible opening beside the public pedestrian path.',
        wardLabel: 'Kathmandu Metropolitan City Ward 1',
        localityLabel: 'Central walkway area',
        publicReason: 'Community report reviewed on 1 January 2030.',
      },
      mediaBindingReceipt: binding.receipt,
    });
    const input = {
      submissionId,
      idempotencyKey: '60000000-0000-4000-8000-000000000006',
      actor,
      moderation,
    };
    const dependencies = {
      ...workflowDependencies,
      keys: capabilityKeys,
    };
    const approved = await moderateSubmission(input, dependencies);
    assert.equal(approved.replayed, false);
    assert.equal(approved.state, 'approved');
    assert.equal(approved.issue?.publicationState, 'commit_pending');

    const privateOnly = await query.query(
      `select
         (select count(*)::integer from nagarik.issues) as issues,
         (select count(*)::integer from nagarik.issue_versions) as versions,
         (select count(*)::integer from nagarik.outbox_jobs where operation_type = 'issue_created') as jobs,
         (select count(*)::integer from public.issue_projection) as public_issues`,
    );
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(privateOnly[0]).map(([key, value]) => [key, Number(value)]),
      ),
      { issues: 1, versions: 1, jobs: 1, public_issues: 0 },
    );
    const mediaBoundary = await query.query(
      `select
         source.state as source_state,
         derivative.state as derivative_state,
         derivative.source_media_id,
         capability.state as receipt_state
       from nagarik.media_objects source
       join nagarik.media_objects derivative on derivative.source_media_id = source.id
       join nagarik.capabilities capability on capability.subject_id = derivative.id
       where source.id = $1::uuid and capability.purpose = 7`,
      [mediaId],
    );
    assert.deepEqual(mediaBoundary[0], {
      source_state: 'approved_private',
      derivative_state: 'approved_public',
      source_media_id: mediaId,
      receipt_state: 'consumed',
    });

    const replay = await moderateSubmission(input, dependencies);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.issue, approved.issue);
    await query.query(
      `update nagarik.outbox_jobs
       set available_at = now() - interval '1 second'
       where operation_type = 'issue_created'`,
    );
    await query.query(
      `update nagarik.capability_kill_switches
       set disabled = true, reason = 'publication_recovery_test'
       where capability = 'publicationEnabled'`,
    );

    const observations = new Map<string, ObservedCommitmentEvent>();
    const signer: ChainSigner = {
      profile: {
        cluster: 'custom',
        genesisHash: 'test-custom-genesis-hash',
        programId: V2_PROGRAM_ID.toBase58(),
        authority: '94GGj4zzhRQV5FzpL3RmYoZrH5qoLhdRMKYj9t9ndv5i',
      },
      async inspect(job) {
        return observations.get(job.eventId) ?? null;
      },
      async submit() {
        return signature;
      },
      async confirm(job) {
        const observation = createObservedEvent(
          {
            schemaVersion: job.schemaVersion,
            operation: job.operation,
            publicIssueId: job.publicIssueId,
            databaseEventId: job.databaseEventId,
            issueKey: job.issueKey,
            eventId: job.eventId,
            operationId: job.operationId,
            payloadHash: job.payloadHash,
            expected: job.expected,
            next: job.next,
          },
          {
            signature,
            finalizedSlot: 44,
            accountSha256: 'aa'.repeat(32),
          },
        );
        observations.set(job.eventId, observation);
        return observation;
      },
    };
    assert.deepEqual(
      await processChainOutboxBatch(
        { query, transaction, signer, workerId: 'publication-test', now },
        10,
      ),
      {
        claimed: 1,
        confirmed: 0,
        submittedUnknown: 0,
        retry: 1,
        deadLetter: 0,
      },
    );
    const deferred = await query.query(
      `select
         (select count(*)::integer from public.issue_projection) as public_issues,
         state,
         last_error_category
       from nagarik.outbox_jobs
       where operation_type = 'issue_created'`,
    );
    assert.deepEqual(
      {
        publicIssues: Number(deferred[0].public_issues),
        state: deferred[0].state,
        error: deferred[0].last_error_category,
      },
      { publicIssues: 0, state: 'submitted_unknown', error: 'publication_disabled' },
    );
    await query.query(
      `update nagarik.capability_kill_switches
       set disabled = false, reason = 'workflow_test'
       where capability = 'publicationEnabled'`,
    );
    await query.query(
      `update nagarik.outbox_jobs
       set available_at = now() - interval '1 second'
       where operation_type = 'issue_created'`,
    );
    assert.equal(
      (
        await processChainOutboxBatch(
          { query, transaction, signer, workerId: 'publication-recovery-test', now },
          10,
        )
      ).confirmed,
      1,
    );

    const published = await query.query(
      `select
         projection.public_id,
         projection.publication_state,
         projection.title,
         projection.lifecycle,
         projection.signal_count,
         media.state as media_state,
         proof.protocol_version,
         proof.update_count,
         encode(proof.evidence_hash, 'hex') as evidence_hash
       from public.issue_projection projection
       join public.media_projection media on media.issue_public_id = projection.public_id
       join public.proof_projection proof on proof.issue_public_id = projection.public_id`,
    );
    assert.equal(published.length, 1);
    assert.equal(published[0].public_id, approved.issue?.publicId);
    assert.equal(published[0].publication_state, 'published');
    assert.equal(published[0].lifecycle, 'open');
    assert.equal(Number(published[0].signal_count), 0);
    assert.equal(published[0].media_state, 'eligible');
    assert.equal(published[0].protocol_version, 'v2');
    assert.equal(Number(published[0].update_count), 1);
    assert.equal(published[0].evidence_hash, derivative.sha256);

    const sourceLeak = JSON.stringify(published[0]);
    assert.equal(sourceLeak.includes('private/local/test'), false);
    assert.equal(sourceLeak.includes('Image and location were reviewed'), false);

    const lifecycle = await changeIssueLifecycle(
      {
        publicId: approved.issue!.publicId,
        idempotencyKey: '70000000-0000-4000-8000-000000000007',
        actor: { subjectId: operatorId, organizationId },
        change: parseLifecycleInput({
          expectedDomainVersion: 1,
          expectedTimelineHead: approved.issue!.timelineHead,
          toState: 'in_progress',
          reasonCode: 'work_started',
          publicNote: 'Maintenance work has started.',
          observedAt: '2030-01-01T00:00:00.000Z',
        }),
      },
      dependencies,
    );
    assert.equal(lifecycle.replayed, false);
    assert.equal(lifecycle.lifecycle, 'in_progress');
    assert.equal(lifecycle.chainSequence, 2);
    const beforeLifecycleConfirmation = await query.query(
      `select lifecycle from public.issue_projection where public_id = $1::uuid`,
      [approved.issue!.publicId],
    );
    assert.equal(beforeLifecycleConfirmation[0].lifecycle, 'open');

    await query.query(
      `update nagarik.outbox_jobs
       set available_at = now() - interval '1 second'
       where operation_type = 'lifecycle_changed'`,
    );
    assert.equal(
      (
        await processChainOutboxBatch(
          { query, transaction, signer, workerId: 'lifecycle-test', now },
          10,
        )
      ).confirmed,
      1,
    );
    const afterLifecycleConfirmation = await query.query(
      `select
         projection.lifecycle,
         proof.update_count,
         (select count(*)::integer
          from public.event_projection event
          where event.issue_public_id = projection.public_id
            and event.event_type = 'lifecycle') as lifecycle_events
       from public.issue_projection projection
       join public.proof_projection proof on proof.issue_public_id = projection.public_id
       where projection.public_id = $1::uuid`,
      [approved.issue!.publicId],
    );
    assert.equal(afterLifecycleConfirmation[0].lifecycle, 'in_progress');
    assert.equal(Number(afterLifecycleConfirmation[0].update_count), 2);
    assert.equal(Number(afterLifecycleConfirmation[0].lifecycle_events), 1);

    const signalInput = {
      publicId: approved.issue!.publicId,
      capability: {
        organizationId,
        capabilityId: '80000000-0000-4000-8000-000000000008',
        subjectId: '81000000-0000-4000-8000-000000000008',
        keyVersion: 1,
      },
    };
    const firstSignal = await recordPublicSignal(signalInput, {
      transaction,
      correlationKey: 'signal-correlation-key-material-32-bytes',
      now,
    });
    assert.deepEqual(firstSignal, {
      replayed: false,
      publicId: approved.issue!.publicId,
      signalCount: 1,
      semantics: 'attention_not_verification',
    });
    assert.equal(
      (
        await recordPublicSignal(signalInput, {
          transaction,
          correlationKey: 'signal-correlation-key-material-32-bytes',
          now,
        })
      ).replayed,
      true,
    );
    const retracted = await retractPublicSignal(signalInput, {
      transaction,
      correlationKey: 'signal-correlation-key-material-32-bytes',
      now,
    });
    assert.equal(retracted.replayed, false);
    assert.equal(retracted.signalCount, 0);
    assert.equal(
      (
        await retractPublicSignal(signalInput, {
          transaction,
          correlationKey: 'signal-correlation-key-material-32-bytes',
          now,
        })
      ).replayed,
      true,
    );
    const reactivated = await recordPublicSignal(signalInput, {
      transaction,
      correlationKey: 'signal-correlation-key-material-32-bytes',
      now,
    });
    assert.equal(reactivated.replayed, false);
    assert.equal(reactivated.signalCount, 1);
    const afterSignals = await query.query(
      `select
         projection.signal_count,
         projection.lifecycle,
         issue.lifecycle as private_lifecycle,
         (select count(*)::integer
          from nagarik.outbox_jobs
          where issue_id = issue.id) as chain_jobs
       from public.issue_projection projection
       join nagarik.issues issue on issue.public_id = projection.public_id
       where projection.public_id = $1::uuid`,
      [approved.issue!.publicId],
    );
    assert.equal(Number(afterSignals[0].signal_count), 1);
    assert.equal(afterSignals[0].lifecycle, 'in_progress');
    assert.equal(afterSignals[0].private_lifecycle, 'in_progress');
    assert.equal(Number(afterSignals[0].chain_jobs), 2);

    const handoff = await recordIssueHandoff(
      {
        publicId: approved.issue!.publicId,
        idempotencyKey: '90000000-0000-4000-8000-000000000009',
        actor: { subjectId: operatorId, organizationId },
        handoff: parseHandoffInput({
          expectedDomainVersion: 2,
          expectedHandoffHead: '0'.repeat(64),
          eventType: 'prepared',
          authorityName: 'Kathmandu Metropolitan City',
          channelName: 'Public Works Division',
          channelUrl: 'https://kathmandu.gov.np/',
          publicNote: 'Routing package prepared for the public works division.',
          occurredAt: '2030-01-01T00:00:00.000Z',
        }),
      },
      dependencies,
    );
    assert.equal(handoff.replayed, false);
    assert.equal(handoff.state, 'prepared');
    assert.equal(handoff.chainSequence, 3);
    assert.notEqual(handoff.handoffHead, '0'.repeat(64));
    assert.equal(
      Number(
        (
          await query.query(
            `select count(*)::integer as count
             from public.event_projection
             where issue_public_id = $1::uuid and event_type = 'handoff'`,
            [approved.issue!.publicId],
          )
        )[0].count,
      ),
      0,
    );
    await query.query(
      `update nagarik.outbox_jobs
       set available_at = now() - interval '1 second'
       where operation_type = 'handoff_checkpointed'`,
    );
    assert.equal(
      (
        await processChainOutboxBatch(
          { query, transaction, signer, workerId: 'handoff-test', now },
          10,
        )
      ).confirmed,
      1,
    );
    const afterHandoff = await query.query(
      `select
         projection.lifecycle,
         proof.update_count,
         encode(proof.handoff_head, 'hex') as handoff_head,
         (select count(*)::integer
          from public.event_projection event
          where event.issue_public_id = projection.public_id
            and event.event_type = 'handoff') as handoff_events
       from public.issue_projection projection
       join public.proof_projection proof on proof.issue_public_id = projection.public_id
       where projection.public_id = $1::uuid`,
      [approved.issue!.publicId],
    );
    assert.equal(afterHandoff[0].lifecycle, 'in_progress');
    assert.equal(Number(afterHandoff[0].update_count), 3);
    assert.equal(afterHandoff[0].handoff_head, handoff.handoffHead);
    assert.equal(Number(afterHandoff[0].handoff_events), 1);

    const correction = await correctPublishedIssue(
      {
        publicId: approved.issue!.publicId,
        idempotencyKey: 'a0000000-0000-4000-8000-00000000000a',
        actor: { subjectId: operatorId, organizationId },
        correction: parseCorrectionInput({
          expectedDomainVersion: 3,
          expectedTimelineHead: lifecycle.timelineHead,
          reasonCode: 'wording_clarified',
          privateNote: 'Clarified the visible condition without changing the evidence.',
          publicCopy: {
            title: 'Displaced drain cover beside a public walkway',
            narrative:
              'A displaced drain cover leaves a visible opening beside the public pedestrian path.',
            wardLabel: 'Kathmandu Metropolitan City Ward 1',
            localityLabel: 'Central walkway area',
            publicReason: 'Description clarified after review.',
          },
        }),
      },
      dependencies,
    );
    assert.equal(correction.chainSequence, 4);
    assert.equal(
      (
        await query.query(`select title from public.issue_projection where public_id = $1::uuid`, [
          approved.issue!.publicId,
        ])
      )[0].title,
      'Loose drain cover beside a public walkway',
    );
    await query.query(
      `update nagarik.outbox_jobs
       set available_at = now() - interval '1 second'
       where operation_type = 'metadata_version_committed'`,
    );
    assert.equal(
      (
        await processChainOutboxBatch(
          { query, transaction, signer, workerId: 'correction-test', now },
          10,
        )
      ).confirmed,
      1,
    );
    const corrected = await query.query(
      `select
         projection.title,
         projection.publication_state,
         proof.update_count,
         (select count(*)::integer
          from nagarik.issue_versions version
          join nagarik.issues issue on issue.id = version.issue_id
          where issue.public_id = projection.public_id
            and version.state = 'superseded') as superseded_versions
       from public.issue_projection projection
       join public.proof_projection proof on proof.issue_public_id = projection.public_id
       where projection.public_id = $1::uuid`,
      [approved.issue!.publicId],
    );
    assert.equal(corrected[0].title, 'Displaced drain cover beside a public walkway');
    assert.equal(corrected[0].publication_state, 'published');
    assert.equal(Number(corrected[0].update_count), 4);
    assert.equal(Number(corrected[0].superseded_versions), 1);

    const removal = await removePublishedIssue(
      {
        publicId: approved.issue!.publicId,
        idempotencyKey: 'b0000000-0000-4000-8000-00000000000b',
        actor: { subjectId: operatorId, organizationId },
        removal: parseRemovalInput({
          expectedDomainVersion: 4,
          expectedTimelineHead: correction.timelineHead,
          reasonCode: 'privacy_request',
          publicMessage: 'This record was removed after a privacy review.',
          privateNote: 'Removal request validated by the privacy reviewer.',
        }),
      },
      dependencies,
    );
    assert.equal(removal.chainSequence, 5);
    assert.equal(
      (
        await query.query(
          `select publication_state
           from public.issue_projection
           where public_id = $1::uuid`,
          [approved.issue!.publicId],
        )
      )[0].publication_state,
      'published',
    );
    await query.query(
      `update nagarik.outbox_jobs
       set available_at = now() - interval '1 second'
       where operation_type = 'publication_removed'`,
    );
    assert.equal(
      (
        await processChainOutboxBatch(
          { query, transaction, signer, workerId: 'removal-test', now },
          10,
        )
      ).confirmed,
      1,
    );
    const removed = await query.query(
      `select
         projection.publication_state,
         projection.title,
         projection.narrative,
         projection.location,
         projection.media_id,
         projection.tombstone,
         proof.update_count
       from public.issue_projection projection
       join public.proof_projection proof on proof.issue_public_id = projection.public_id
       where projection.public_id = $1::uuid`,
      [approved.issue!.publicId],
    );
    assert.equal(removed[0].publication_state, 'removed');
    assert.equal(removed[0].title, null);
    assert.equal(removed[0].narrative, null);
    assert.equal(removed[0].location, null);
    assert.equal(removed[0].media_id, null);
    assert.equal((removed[0].tombstone as Record<string, unknown>).reasonCode, 'privacy_request');
    assert.equal(Number(removed[0].update_count), 5);
  } finally {
    await database.close();
  }
});
