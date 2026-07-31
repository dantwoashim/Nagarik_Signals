import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { readJsonLimited } from '@/lib/api/requestBody';
import {
  operatorWorkflowFailure,
  requiredCorrelationKey,
  validUuid,
} from '@/lib/api/operatorWorkflow';
import { requireOperator } from '@/lib/auth/operator';
import { runDatabaseTransaction } from '@/lib/db/transaction';
import { capabilityKeysFromEnvironment } from '@/lib/security/capabilityTokens';
import { requireIdempotencyKey } from '@/lib/security/ids';
import { assertTrustedMutation, securityErrorResponse } from '@/lib/security/request';
import { createPilotInvitation, parsePilotInvitationInput } from '@/lib/services/pilotInvitations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const requestId = `req_${randomUUID()}`;
  try {
    assertTrustedMutation(request, { maxBytes: 8 * 1024 });
    const idempotencyKey = requireIdempotencyKey(request);
    const organizationId = new URL(request.url).searchParams.get('organizationId') ?? '';
    if (!validUuid(organizationId)) {
      return NextResponse.json(
        { ok: false, requestId, error: { code: 'organization_required', retryable: false } },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const operator = await requireOperator({ organizationId, roles: ['org_admin'] });
    const invitation = parsePilotInvitationInput(await readJsonLimited<unknown>(request, 8 * 1024));
    const result = await createPilotInvitation(
      {
        idempotencyKey,
        actor: { subjectId: operator.user.id, organizationId },
        invitation,
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
        status: 201,
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
      {
        ok: false,
        requestId,
        error: { code: 'pilot_invitation_unavailable', retryable: true },
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
