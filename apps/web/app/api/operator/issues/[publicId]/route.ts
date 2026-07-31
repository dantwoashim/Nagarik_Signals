import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { operatorWorkflowFailure, requireIssueOperator } from '@/lib/api/operatorWorkflow';
import { databaseExecutor } from '@/lib/db/transaction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bytesHex(value: unknown): string {
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  if (typeof value === 'string') return value.replace(/^\\x/, '');
  throw new Error('database_hash_invalid');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const requestId = `req_${randomUUID()}`;
  try {
    const { publicId } = await params;
    await requireIssueOperator(publicId, [
      'moderator',
      'steward',
      'privacy_reviewer',
      'auditor',
      'org_admin',
    ]);
    const rows = await databaseExecutor().query(
      `select
         issue.id,
         issue.public_id,
         issue.publication_state,
         issue.lifecycle,
         issue.domain_version,
         issue.checkpoint_update_count,
         issue.confirmed_update_count,
         issue.projected_timeline_head,
         issue.projected_handoff_head,
         issue.blocked_from_sequence,
         issue.created_at,
         issue.updated_at,
         version.id as version_id,
         version.version_number,
         version.title,
         version.narrative,
         version.category,
         version.ward_id,
         version.ward_label,
         version.locality_label,
         version.public_reason,
         version.published_at,
         handoff.state as handoff_state,
         handoff.version as handoff_version,
         handoff.public_sequence as handoff_public_sequence,
         handoff.updated_at as handoff_updated_at
       from nagarik.issues issue
       join nagarik.issue_versions version on version.id = issue.current_version_id
       left join nagarik.handoff_aggregates handoff on handoff.issue_id = issue.id
       where issue.public_id = $1::uuid
         and issue.workflow_version = 'v2'
       limit 1`,
      [publicId],
    );
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { ok: false, requestId, error: { code: 'resource_not_found', retryable: false } },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const [lifecycleEvents, handoffEvents] = await Promise.all([
      databaseExecutor().query(
        `select
           id, from_state, to_state, reason_code, public_note,
           observed_at, chain_sequence, checkpoint_state, created_at
         from nagarik.lifecycle_events
         where issue_id = $1::uuid
         order by created_at desc, id desc
         limit 25`,
        [String(row.id)],
      ),
      databaseExecutor().query(
        `select
           id, event_type, public_event, public_sequence,
           chain_sequence, checkpoint_state, created_at
         from nagarik.handoff_events
         where issue_id = $1::uuid
           and public_event is not null
         order by private_sequence desc
         limit 25`,
        [String(row.id)],
      ),
    ]);
    return NextResponse.json(
      {
        ok: true,
        requestId,
        data: {
          publicId: row.public_id,
          publicationState: row.publication_state,
          lifecycle: row.lifecycle,
          domainVersion: Number(row.domain_version),
          checkpointUpdateCount: Number(row.checkpoint_update_count),
          confirmedUpdateCount: Number(row.confirmed_update_count),
          projectedTimelineHead: bytesHex(row.projected_timeline_head),
          projectedHandoffHead: bytesHex(row.projected_handoff_head),
          blockedFromSequence:
            row.blocked_from_sequence === null ? null : Number(row.blocked_from_sequence),
          createdAt: new Date(String(row.created_at)).toISOString(),
          updatedAt: new Date(String(row.updated_at)).toISOString(),
          version: {
            id: row.version_id,
            number: Number(row.version_number),
            title: row.title,
            narrative: row.narrative,
            category: row.category,
            wardId: row.ward_id,
            wardLabel: row.ward_label,
            localityLabel: row.locality_label,
            publicReason: row.public_reason,
            publishedAt: row.published_at ? new Date(String(row.published_at)).toISOString() : null,
          },
          handoff: {
            state: row.handoff_state,
            version: row.handoff_version === null ? null : Number(row.handoff_version),
            publicSequence:
              row.handoff_public_sequence === null ? 0 : Number(row.handoff_public_sequence),
            updatedAt: row.handoff_updated_at
              ? new Date(String(row.handoff_updated_at)).toISOString()
              : null,
          },
          lifecycleEvents: lifecycleEvents.map((event) => ({
            id: event.id,
            fromState: event.from_state,
            toState: event.to_state,
            reasonCode: event.reason_code,
            publicNote: event.public_note,
            observedAt: event.observed_at
              ? new Date(String(event.observed_at)).toISOString()
              : null,
            chainSequence: Number(event.chain_sequence),
            checkpointState: event.checkpoint_state,
            createdAt: new Date(String(event.created_at)).toISOString(),
          })),
          handoffEvents: handoffEvents.map((event) => ({
            id: event.id,
            type: event.event_type,
            publicEvent: event.public_event,
            publicSequence: event.public_sequence === null ? null : Number(event.public_sequence),
            chainSequence: event.chain_sequence === null ? null : Number(event.chain_sequence),
            checkpointState: event.checkpoint_state,
            createdAt: new Date(String(event.created_at)).toISOString(),
          })),
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = operatorWorkflowFailure(requestId, error);
    if (mapped) return mapped;
    return NextResponse.json(
      { ok: false, requestId, error: { code: 'operator_issue_unavailable', retryable: true } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
