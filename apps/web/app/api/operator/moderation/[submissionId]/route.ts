import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { readJsonLimited } from '@/lib/api/requestBody';
import {
  operatorWorkflowFailure,
  requiredCorrelationKey,
  requireSubmissionOperator,
} from '@/lib/api/operatorWorkflow';
import { databaseExecutor, runDatabaseTransaction } from '@/lib/db/transaction';
import { capabilityKeysFromEnvironment } from '@/lib/security/capabilityTokens';
import { requireIdempotencyKey } from '@/lib/security/ids';
import { assertTrustedMutation, securityErrorResponse } from '@/lib/security/request';
import { moderateSubmission, parseModerationInput } from '@/lib/services/moderation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const requestId = `req_${randomUUID()}`;
  try {
    const { submissionId } = await params;
    await requireSubmissionOperator(submissionId, [
      'moderator',
      'privacy_reviewer',
      'auditor',
      'org_admin',
    ]);
    const rows = await databaseExecutor().query(
      `select
         submission.id,
         submission.record_kind,
         submission.state,
         submission.version,
         submission.assigned_to,
         submission.received_at,
         submission.updated_at,
         revision.revision_number,
         revision.title,
         revision.narrative,
         revision.category,
         revision.observed_on,
         revision.lat_e3,
         revision.lng_e3,
         revision.ward_id,
         revision.ward_geometry_version,
         revision.locality_label,
         media.id as media_id,
         media.state as media_state,
         media.version as media_version,
         media.mime_type,
         media.byte_length,
         media.width,
         media.height,
         encode(media.sha256, 'hex') as evidence_hash
       from nagarik.submissions submission
       join nagarik.submission_revisions revision
         on revision.submission_id = submission.id
        and revision.revision_number = submission.current_revision_number
       join nagarik.submission_media link on link.revision_id = revision.id and link.position = 0
       join nagarik.media_objects media on media.id = link.media_id
       where submission.id = $1::uuid`,
      [submissionId],
    );
    const row = rows[0];
    if (!row) throw new Error('submission_missing_after_authorization');
    const events = await databaseExecutor().query(
      `select
         id, submission_version, actor_subject, event_type, reason_code,
         private_note, public_safe_message, created_at
       from nagarik.moderation_events
       where submission_id = $1::uuid
       order by created_at, id`,
      [submissionId],
    );
    return NextResponse.json(
      {
        ok: true,
        requestId,
        data: {
          submissionId: row.id,
          recordKind: row.record_kind,
          state: row.state,
          version: Number(row.version),
          assignedTo: row.assigned_to,
          receivedAt: new Date(String(row.received_at)).toISOString(),
          updatedAt: new Date(String(row.updated_at)).toISOString(),
          revision: {
            number: Number(row.revision_number),
            title: row.title,
            narrative: row.narrative,
            category: row.category,
            observedOn: String(row.observed_on).slice(0, 10),
            privateLocation: {
              latitudeE3: Number(row.lat_e3),
              longitudeE3: Number(row.lng_e3),
              wardId: row.ward_id,
              geometryVersion: row.ward_geometry_version,
              localityLabel: row.locality_label,
            },
            media: {
              id: row.media_id,
              url: `/api/media/med_${row.media_id}`,
              state: row.media_state,
              version: Number(row.media_version),
              mimeType: row.mime_type,
              byteLength: Number(row.byte_length),
              width: Number(row.width),
              height: Number(row.height),
              evidenceHash: row.evidence_hash,
            },
          },
          moderationEvents: events.map((event) => ({
            id: event.id,
            submissionVersion: Number(event.submission_version),
            actorSubject: event.actor_subject,
            type: event.event_type,
            reasonCode: event.reason_code,
            privateNote: event.private_note,
            publicSafeMessage: event.public_safe_message,
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
      { ok: false, requestId, error: { code: 'submission_review_unavailable' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const requestId = `req_${randomUUID()}`;
  try {
    assertTrustedMutation(request, { maxBytes: 32 * 1024 });
    const idempotencyKey = requireIdempotencyKey(request);
    const { submissionId } = await params;
    const operator = await requireSubmissionOperator(submissionId, ['moderator', 'org_admin']);
    const moderation = parseModerationInput(await readJsonLimited<unknown>(request, 32 * 1024));
    const result = await moderateSubmission(
      {
        submissionId,
        idempotencyKey,
        actor: {
          subjectId: operator.user.id,
          organizationId: operator.organizationId!,
        },
        moderation,
      },
      {
        transaction: runDatabaseTransaction,
        correlationKey: requiredCorrelationKey(),
        keys: capabilityKeysFromEnvironment(),
      },
    );
    return NextResponse.json(
      { ok: true, requestId, data: result },
      {
        status: result.issue ? 202 : 200,
        headers: {
          'Cache-Control': 'no-store',
          ...(result.replayed ? { 'Idempotency-Replayed': 'true' } : {}),
        },
      },
    );
  } catch (error) {
    const mapped = operatorWorkflowFailure(requestId, error);
    if (mapped) return mapped;
    const security = securityErrorResponse(error);
    if (security) {
      return NextResponse.json(
        { ok: false, requestId, error: { code: security.code, retryable: false } },
        { status: security.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { ok: false, requestId, error: { code: 'moderation_unavailable', retryable: true } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
