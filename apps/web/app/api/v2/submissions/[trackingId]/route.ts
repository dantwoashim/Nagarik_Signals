import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { databaseExecutor } from '@/lib/db/transaction';
import {
  capabilityKeysFromEnvironment,
  parseCapabilityToken,
} from '@/lib/security/capabilityTokens';
import { authorizeTrackingCapability } from '@/lib/security/trackingCapabilityCore';

export const runtime = 'nodejs';

const trackingIdPattern =
  /^trk_([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const segment of header.split(';')) {
    const separator = segment.indexOf('=');
    if (separator > 0 && segment.slice(0, separator).trim() === name) {
      return segment.slice(separator + 1).trim();
    }
  }
  return null;
}

function trackingToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('NagarikTracking ')) {
    return authorization.slice('NagarikTracking '.length);
  }
  return (
    cookieValue(request, '__Host-nagarik-tracking') ??
    (process.env.NODE_ENV === 'production' ? null : cookieValue(request, 'nagarik-tracking'))
  );
}

function neutralNotFound(requestId: string) {
  return NextResponse.json(
    {
      ok: false,
      requestId,
      error: {
        code: 'submission_not_found',
        message: 'The private tracking record is unavailable.',
        retryable: false,
      },
    },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request: Request, context: { params: Promise<{ trackingId: string }> }) {
  const requestId = `req_${randomUUID()}`;
  const { trackingId: opaqueTrackingId } = await context.params;
  const trackingMatch = trackingIdPattern.exec(opaqueTrackingId);
  const token = trackingToken(request);
  const parsed = token ? parseCapabilityToken(token) : null;
  if (!trackingMatch || !token || !parsed || parsed.purpose !== 'submission_tracking') {
    return neutralNotFound(requestId);
  }
  const trackingId = trackingMatch[1];

  try {
    const rows = await databaseExecutor().query(
      `select
         capability.id as capability_id,
         capability.organization_id,
         capability.subject_id,
         capability.issuance_idempotency_id,
         capability.key_version,
         capability.verifier,
         capability.state as capability_state,
         capability.scope,
         capability.expires_at,
         submission.id as submission_id,
         submission.tracking_id,
         submission.state,
         submission.current_revision_number,
         submission.received_at,
         submission.updated_at,
         media.state as media_state,
         issue.public_id
       from nagarik.capabilities capability
       join nagarik.submissions submission on submission.id = capability.subject_id
       join nagarik.submission_revisions revision
         on revision.submission_id = submission.id
        and revision.revision_number = submission.current_revision_number
       left join nagarik.submission_media submission_media
         on submission_media.revision_id = revision.id
       left join nagarik.media_objects media on media.id = submission_media.media_id
       left join nagarik.issues issue on issue.source_submission_id = submission.id
       where capability.id = $1::uuid
         and capability.purpose = 4
         and submission.tracking_id = $2::uuid
       limit 1`,
      [parsed.capabilityId, trackingId],
    );
    const row = rows[0];
    if (!row) return neutralNotFound(requestId);

    const authorized = authorizeTrackingCapability(
      token,
      {
        keyVersion: Number(row.key_version),
        purpose: 'submission_tracking',
        organizationId: String(row.organization_id),
        capabilityId: String(row.capability_id),
        subjectId: String(row.subject_id),
        issuanceIdempotencyId: String(row.issuance_idempotency_id),
        verifier: row.verifier as Uint8Array,
        state: String(row.capability_state),
        expiresAt: new Date(String(row.expires_at)),
        scope: row.scope,
      },
      {
        submissionId: String(row.submission_id),
        trackingId: String(row.tracking_id),
        organizationId: String(row.organization_id),
      },
      capabilityKeysFromEnvironment(),
    );
    if (!authorized) return neutralNotFound(requestId);

    return NextResponse.json(
      {
        ok: true,
        requestId,
        data: {
          trackingId: opaqueTrackingId,
          state: row.state,
          currentRevision: Number(row.current_revision_number),
          receivedAt: new Date(String(row.received_at)).toISOString(),
          updatedAt: new Date(String(row.updated_at)).toISOString(),
          media: { state: row.media_state ?? 'unavailable' },
          publicIssueId: row.public_id ? `issue_${row.public_id}` : null,
          next:
            row.state === 'received' || row.state === 'revision_pending'
              ? 'review'
              : row.state === 'changes_requested'
                ? 'revision'
                : row.state,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return neutralNotFound(requestId);
  }
}
