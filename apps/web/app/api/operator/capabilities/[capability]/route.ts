import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { operatorWorkflowFailure } from '@/lib/api/operatorWorkflow';
import { readJsonLimited } from '@/lib/api/requestBody';
import { requireOperator } from '@/lib/auth/operator';
import { runDatabaseTransaction } from '@/lib/db/transaction';
import { requireIdempotencyKey } from '@/lib/security/ids';
import { assertTrustedMutation, securityErrorResponse } from '@/lib/security/request';
import {
  capabilityCeilingsFromEnvironment,
  CapabilitySwitchError,
  changeCapabilitySwitch,
  parseCapabilityName,
  parseCapabilitySwitchInput,
} from '@/lib/services/capabilitySwitches';

export const runtime = 'nodejs';

function correlationKey() {
  const value = process.env.NAGARIK_SECURITY_CORRELATION_KEY;
  if (!value) throw new Error('operator_correlation_key_missing');
  return value;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ capability: string }> },
) {
  const requestId = `req_${randomUUID()}`;
  try {
    assertTrustedMutation(request, { maxBytes: 8 * 1024 });
    const idempotencyKey = requireIdempotencyKey(request);
    const { capability: value } = await params;
    const capability = parseCapabilityName(value);
    const actor = await requireOperator({ organizationId: null, roles: ['system_admin'] });
    const change = parseCapabilitySwitchInput(await readJsonLimited<unknown>(request, 8 * 1024));
    const result = await changeCapabilitySwitch(
      {
        capability,
        change,
        idempotencyKey,
        actorSubjectId: actor.user.id,
      },
      {
        transaction: runDatabaseTransaction,
        correlationKey: correlationKey(),
        ceilings: capabilityCeilingsFromEnvironment(process.env),
      },
    );
    return NextResponse.json(
      { ok: true, requestId, data: result },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          ...(result.replayed ? { 'Idempotency-Replayed': 'true' } : {}),
        },
      },
    );
  } catch (error) {
    const mapped = operatorWorkflowFailure(requestId, error);
    if (mapped) return mapped;
    if (error instanceof CapabilitySwitchError) {
      return NextResponse.json(
        { ok: false, requestId, error: { code: error.code, retryable: false } },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const security = securityErrorResponse(error);
    if (security) {
      return NextResponse.json(
        { ok: false, requestId, error: { code: security.code, retryable: false } },
        { status: security.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { ok: false, requestId, error: { code: 'capability_switch_unavailable', retryable: true } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
