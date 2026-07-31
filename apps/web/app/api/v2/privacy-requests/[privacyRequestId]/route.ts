import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { databaseExecutor } from '@/lib/db/transaction';
import {
  capabilityKeysFromEnvironment,
  parseCapabilityToken,
} from '@/lib/security/capabilityTokens';
import { authorizePrivacyTrackingCapability } from '@/lib/security/privacyTrackingCore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestIdPattern =
  /^prv_([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;

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

function privacyToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('NagarikPrivacy ')) {
    return authorization.slice('NagarikPrivacy '.length);
  }
  return (
    cookieValue(request, '__Host-nagarik-privacy') ??
    (process.env.NODE_ENV === 'production' ? null : cookieValue(request, 'nagarik-privacy'))
  );
}

function neutralNotFound(requestId: string) {
  return NextResponse.json(
    {
      ok: false,
      requestId,
      error: {
        code: 'privacy_request_unavailable',
        message: 'The private request is unavailable.',
        retryable: false,
      },
    },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ privacyRequestId: string }> },
) {
  const requestId = `req_${randomUUID()}`;
  const { privacyRequestId: opaqueId } = await context.params;
  const match = requestIdPattern.exec(opaqueId);
  const token = privacyToken(request);
  const parsed = token ? parseCapabilityToken(token) : null;
  if (!match || !token || !parsed || parsed.purpose !== 'privacy_tracking') {
    return neutralNotFound(requestId);
  }
  const privacyRequestId = match[1];

  try {
    const rows = await databaseExecutor().query(
      `select
         request.id, request.organization_id, request.state, request.version,
         request.outcome_public, request.created_at, request.updated_at, request.closed_at,
         capability.id as capability_id, capability.subject_id,
         capability.issuance_idempotency_id, capability.key_version,
         capability.verifier, capability.state as capability_state,
         capability.scope, capability.expires_at,
         exists (
           select 1
           from nagarik.privacy_exports export
           where export.privacy_request_id = request.id
             and export.state = 'available'
             and export.expires_at > now()
         ) as export_available
       from nagarik.privacy_requests request
       join nagarik.capabilities capability on capability.id = request.tracking_capability_id
       where request.id = $1::uuid
         and capability.id = $2::uuid
         and capability.purpose = 5
       limit 1`,
      [privacyRequestId, parsed.capabilityId],
    );
    const row = rows[0];
    if (!row) return neutralNotFound(requestId);
    const authorized = authorizePrivacyTrackingCapability(
      token,
      {
        keyVersion: Number(row.key_version),
        purpose: 'privacy_tracking',
        organizationId: String(row.organization_id),
        capabilityId: String(row.capability_id),
        subjectId: String(row.subject_id),
        issuanceIdempotencyId: String(row.issuance_idempotency_id),
        verifier: row.verifier as Uint8Array,
        state: String(row.capability_state),
        expiresAt: new Date(String(row.expires_at)),
        scope: row.scope,
      },
      { privacyRequestId, organizationId: String(row.organization_id), action: 'read' },
      capabilityKeysFromEnvironment(),
    );
    if (!authorized) return neutralNotFound(requestId);

    return NextResponse.json(
      {
        ok: true,
        requestId,
        data: {
          privacyRequestId: opaqueId,
          state: row.state,
          version: Number(row.version),
          publicOutcome: row.outcome_public ?? null,
          informationRequest: null,
          exportAvailable: row.export_available === true,
          receivedAt: new Date(String(row.created_at)).toISOString(),
          updatedAt: new Date(String(row.updated_at)).toISOString(),
          closedAt: row.closed_at ? new Date(String(row.closed_at)).toISOString() : null,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return neutralNotFound(requestId);
  }
}
