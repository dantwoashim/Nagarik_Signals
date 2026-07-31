import { randomUUID } from 'node:crypto';

import type { QueryExecutor } from '../db/query';
import type { PrivateStagedObject } from '../storage/privateStorage';
import { keyedActorHash } from '../security/ids';

type RetentionCandidate = {
  id: string;
  organization_id: string;
  state: string;
  storage_key: string;
};

type Dependencies = {
  query: QueryExecutor;
  transaction<T>(operation: (query: QueryExecutor) => Promise<T>): Promise<T>;
  remove(object: PrivateStagedObject): Promise<void>;
  storageMode: PrivateStagedObject['storageMode'];
  correlationKey: string;
  now?: () => Date;
};

export type MediaRetentionResult = {
  inspected: number;
  deleted: number;
  failed: number;
  skipped: number;
};

const deletableStates = [
  'staged',
  'promotion_pending',
  'promotion_failed',
  'quarantined',
  'approved_private',
  'redacted_derivative',
  'rejected',
  'expired',
  'removed',
] as const;

export async function sweepExpiredMedia(
  dependencies: Dependencies,
  requestedLimit = 25,
): Promise<MediaRetentionResult> {
  const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), 100);
  const now = dependencies.now?.() ?? new Date();
  const candidates = (await dependencies.query.query(
    `select media.id, media.organization_id, media.state, media.storage_key
     from nagarik.media_objects media
     where media.state = any($1::text[])
       and media.expires_at is not null
       and media.expires_at <= $2::timestamptz
       and media.deleted_at is null
       and not exists (
         select 1
         from nagarik.outbox_jobs job
         where job.operation_type = 'media_promote'
           and job.canonical_payload->>'mediaId' = media.id::text
           and job.state in ('pending', 'leased', 'submitted_unknown', 'confirming')
       )
     order by media.expires_at, media.id
     limit $3`,
    [deletableStates, now.toISOString(), limit],
  )) as RetentionCandidate[];

  const result: MediaRetentionResult = {
    inspected: candidates.length,
    deleted: 0,
    failed: 0,
    skipped: 0,
  };
  const actorKey = keyedActorHash(dependencies.correlationKey, 'media-retention-worker');

  for (const candidate of candidates) {
    try {
      await dependencies.remove({
        storageKey: candidate.storage_key,
        storageMode: dependencies.storageMode,
      });
    } catch {
      result.failed += 1;
      continue;
    }

    const committed = await dependencies.transaction(async (query) => {
      const rows = await query.query(
        `update nagarik.media_objects
         set
           state = 'deleted',
           version = version + 1,
           deleted_at = $5::timestamptz,
           updated_at = $5::timestamptz
         where id = $1::uuid
           and organization_id = $2::uuid
           and state = $3
           and storage_key = $4
           and expires_at <= $5::timestamptz
           and deleted_at is null
         returning id`,
        [
          candidate.id,
          candidate.organization_id,
          candidate.state,
          candidate.storage_key,
          now.toISOString(),
        ],
      );
      if (!rows[0]) return false;
      await query.query(
        `insert into nagarik.audit_events(
           id,
           organization_id,
           actor_type,
           actor_key,
           action,
           resource_type,
           resource_id,
           request_id,
           detail,
           occurred_at
         )
         values (
           $1::uuid,
           $2::uuid,
           'system',
           decode($3, 'hex'),
           'media_retention_deleted',
           'media',
           $4::uuid,
           $5::uuid,
           $6::jsonb,
           $7::timestamptz
         )`,
        [
          randomUUID(),
          candidate.organization_id,
          actorKey,
          candidate.id,
          randomUUID(),
          JSON.stringify({ previousState: candidate.state }),
          now.toISOString(),
        ],
      );
      return true;
    });
    if (committed) result.deleted += 1;
    else result.skipped += 1;
  }

  return result;
}
