import { createHash } from 'node:crypto';

import { z } from 'zod';

import type { QueryExecutor } from '../db/query';
import { canonicalize } from '../proof/canonicalize';
import { deterministicUuid } from '../security/ids';
import type { PrivateStagedObject } from '../storage/privateStorage';

const promotionPayloadSchema = z
  .object({
    schemaVersion: z.literal('media-promotion-v1'),
    organizationId: z.string().uuid(),
    submissionId: z.string().uuid(),
    mediaId: z.string().uuid(),
    sourceStorageKey: z.string().min(1),
    destinationStorageKey: z.string().min(1),
    expected: z
      .object({
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        byteLength: z
          .number()
          .int()
          .positive()
          .max(6 * 1024 * 1024),
        mimeType: z.enum(['image/jpeg', 'image/webp']),
      })
      .strict(),
  })
  .strict();

export type MediaPromotionJob = {
  id: string;
  leaseOwner: string;
  attemptNumber: number;
  canonicalPayload: unknown;
  payloadHash: string;
};

type Dependencies = {
  read(storageKey: string, maximumBytes?: number): Promise<{ bytes: Buffer; contentType: string }>;
  write(input: {
    storageKey: string;
    bytes: Uint8Array;
    contentType: 'image/jpeg' | 'image/webp';
  }): Promise<PrivateStagedObject>;
  remove(object: PrivateStagedObject): Promise<void>;
  transaction<T>(operation: (query: QueryExecutor) => Promise<T>): Promise<T>;
  storageMode: 'blob' | 'local';
  retentionDays: number;
  now?: () => Date;
};

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function recordFailure(
  job: MediaPromotionJob,
  errorCategory: string,
  dependencies: Dependencies,
): Promise<'retry' | 'dead_letter'> {
  const now = dependencies.now?.() ?? new Date();
  const deadLetter = job.attemptNumber >= 5;
  await dependencies.transaction(async (query) => {
    const locked = await query.query(
      `select state, lease_owner
       from nagarik.outbox_jobs
       where id = $1::uuid
       for update`,
      [job.id],
    );
    if (
      locked.length !== 1 ||
      locked[0].state !== 'leased' ||
      locked[0].lease_owner !== job.leaseOwner
    ) {
      throw new Error('media_promotion_lease_lost');
    }
    const attemptId = deterministicUuid(
      'nagarik:v2:media-promotion-attempt',
      `${job.id}:${job.attemptNumber}`,
    );
    await query.query(
      `insert into nagarik.outbox_attempts(
         id,
         outbox_job_id,
         attempt_number,
         result,
         error_category,
         diagnostic,
         started_at,
         finished_at
       )
       values (
         $1::uuid,
         $2::uuid,
         $3,
         'failure',
         $4,
         '{}'::jsonb,
         $5::timestamptz,
         $5::timestamptz
       )`,
      [attemptId, job.id, job.attemptNumber, errorCategory, now.toISOString()],
    );
    await query.query(
      `update nagarik.outbox_jobs
       set
         state = $2,
         available_at = $3::timestamptz,
         lease_owner = null,
         lease_expires_at = null,
         last_error_category = $4,
         updated_at = $5::timestamptz
       where id = $1::uuid`,
      [
        job.id,
        deadLetter ? 'dead_letter' : 'pending',
        new Date(now.getTime() + Math.min(60_000, 2 ** job.attemptNumber * 1_000)).toISOString(),
        errorCategory,
        now.toISOString(),
      ],
    );
    if (deadLetter) {
      const parsed = promotionPayloadSchema.safeParse(job.canonicalPayload);
      if (parsed.success) {
        await query.query(
          `update nagarik.media_objects
           set state = 'promotion_failed', version = version + 1, updated_at = $2::timestamptz
           where id = $1::uuid
             and state = 'promotion_pending'`,
          [parsed.data.mediaId, now.toISOString()],
        );
      }
    }
  });
  return deadLetter ? 'dead_letter' : 'retry';
}

export async function processMediaPromotion(
  job: MediaPromotionJob,
  dependencies: Dependencies,
): Promise<'confirmed' | 'retry' | 'dead_letter'> {
  const parsed = promotionPayloadSchema.safeParse(job.canonicalPayload);
  if (!parsed.success) return recordFailure(job, 'payload_invalid', dependencies);
  const payload = parsed.data;
  const expectedPayloadHash = createHash('sha256').update(canonicalize(payload)).digest('hex');
  if (expectedPayloadHash !== job.payloadHash) {
    return recordFailure(job, 'payload_hash_mismatch', dependencies);
  }

  let source: { bytes: Buffer; contentType: string };
  try {
    source = await dependencies.read(payload.sourceStorageKey, payload.expected.byteLength);
  } catch {
    return recordFailure(job, 'staging_read_failed', dependencies);
  }
  if (
    source.bytes.byteLength !== payload.expected.byteLength ||
    source.contentType !== payload.expected.mimeType ||
    hash(source.bytes) !== payload.expected.sha256
  ) {
    return recordFailure(job, 'staging_integrity_mismatch', dependencies);
  }

  let destination: PrivateStagedObject | undefined;
  try {
    destination = await dependencies.write({
      storageKey: payload.destinationStorageKey,
      bytes: source.bytes,
      contentType: payload.expected.mimeType,
    });
    const verified = await dependencies.read(
      payload.destinationStorageKey,
      payload.expected.byteLength,
    );
    if (
      verified.bytes.byteLength !== payload.expected.byteLength ||
      verified.contentType !== payload.expected.mimeType ||
      hash(verified.bytes) !== payload.expected.sha256
    ) {
      throw new Error('durable_integrity_mismatch');
    }
  } catch {
    if (destination) {
      await dependencies.remove(destination).catch(() => undefined);
    }
    return recordFailure(job, 'durable_write_failed', dependencies);
  }

  const now = dependencies.now?.() ?? new Date();
  try {
    await dependencies.transaction(async (query) => {
      const locked = await query.query(
        `select
           job.state,
           job.lease_owner,
           media.state as media_state,
           media.storage_key
         from nagarik.outbox_jobs job
         join nagarik.media_objects media
           on media.id = ($2::uuid)
          and media.organization_id = job.organization_id
         where job.id = $1::uuid
         for update of job, media`,
        [job.id, payload.mediaId],
      );
      const row = locked[0];
      if (
        !row ||
        row.state !== 'leased' ||
        row.lease_owner !== job.leaseOwner ||
        row.media_state !== 'promotion_pending' ||
        row.storage_key !== payload.sourceStorageKey
      ) {
        throw new Error('media_promotion_lease_lost');
      }

      await query.query(
        `update nagarik.media_objects
         set
           state = 'quarantined',
           storage_class = 'durable_private',
           storage_key = $2,
           version = version + 1,
           expires_at = $3::timestamptz,
           updated_at = $4::timestamptz
         where id = $1::uuid`,
        [
          payload.mediaId,
          payload.destinationStorageKey,
          new Date(now.getTime() + dependencies.retentionDays * 24 * 60 * 60_000).toISOString(),
          now.toISOString(),
        ],
      );
      const attemptId = deterministicUuid(
        'nagarik:v2:media-promotion-attempt',
        `${job.id}:${job.attemptNumber}`,
      );
      await query.query(
        `insert into nagarik.outbox_attempts(
           id,
           outbox_job_id,
           attempt_number,
           result,
           diagnostic,
           started_at,
           finished_at
         )
         values (
           $1::uuid,
           $2::uuid,
           $3,
           'confirmed',
           '{}'::jsonb,
           $4::timestamptz,
           $4::timestamptz
         )`,
        [attemptId, job.id, job.attemptNumber, now.toISOString()],
      );
      await query.query(
        `update nagarik.outbox_jobs
         set
           state = 'confirmed',
           lease_owner = null,
           lease_expires_at = null,
           last_error_category = null,
           updated_at = $2::timestamptz
         where id = $1::uuid`,
        [job.id, now.toISOString()],
      );
    });
  } catch (error) {
    await dependencies.remove(destination).catch(() => undefined);
    throw error;
  }

  await dependencies
    .remove({
      storageKey: payload.sourceStorageKey,
      storageMode: dependencies.storageMode,
    })
    .catch(() => undefined);
  return 'confirmed';
}
