import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { readJsonLimited, RequestBodyError } from '@/lib/api/requestBody';
import { runDatabaseTransaction } from '@/lib/db/transaction';
import { requireIdempotencyKey } from '@/lib/security/ids';
import { assertTrustedMutation, securityErrorResponse } from '@/lib/security/request';
import { requireSignalCapability, SignalAuthorizationError } from '@/lib/security/signalCapability';
import { recordPublicSignal, retractPublicSignal, SignalError } from '@/lib/services/signals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function failure(requestId: string, code: string, status: number) {
  return NextResponse.json(
    { ok: false, requestId, error: { code, retryable: status === 503 } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function signalBody(value: unknown): void {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    (value as Record<string, unknown>).schemaVersion !== 'signal-v1'
  ) {
    throw new RequestBodyError('invalid_json', 400);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const requestId = `req_${randomUUID()}`;
  try {
    assertTrustedMutation(request, { maxBytes: 1_024 });
    requireIdempotencyKey(request);
    signalBody(await readJsonLimited<unknown>(request, 1_024));
    const { publicId } = await params;
    if (!publicIdPattern.test(publicId)) return failure(requestId, 'issue_not_found', 404);
    const capability = await requireSignalCapability(request);
    const correlationKey = process.env.NAGARIK_SECURITY_CORRELATION_KEY;
    if (!correlationKey) return failure(requestId, 'signals_unavailable', 503);
    const result = await recordPublicSignal(
      {
        publicId,
        capability: {
          organizationId: capability.organizationId,
          capabilityId: capability.capabilityId,
          subjectId: capability.subjectId,
          keyVersion: capability.keyVersion,
        },
      },
      { transaction: runDatabaseTransaction, correlationKey },
    );
    return NextResponse.json(
      {
        ok: true,
        requestId,
        data: {
          accepted: true,
          signalCount: result.signalCount,
          meaning: 'attention_signal_not_identity_or_truth',
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          ...(result.replayed ? { 'Idempotency-Replayed': 'true' } : {}),
        },
      },
    );
  } catch (error) {
    if (error instanceof SignalAuthorizationError) {
      return failure(requestId, error.code, error.status);
    }
    if (error instanceof SignalError) return failure(requestId, error.code, error.status);
    if (error instanceof RequestBodyError) return failure(requestId, 'signal_invalid', 400);
    const security = securityErrorResponse(error);
    if (security) return failure(requestId, security.code, security.status);
    if (error instanceof Error && error.message === 'idempotency_key_required') {
      return failure(requestId, error.message, 400);
    }
    return failure(requestId, 'signals_unavailable', 503);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const requestId = `req_${randomUUID()}`;
  try {
    assertTrustedMutation(request, { maxBytes: 0 });
    requireIdempotencyKey(request);
    const { publicId } = await params;
    if (!publicIdPattern.test(publicId)) return failure(requestId, 'issue_not_found', 404);
    const capability = await requireSignalCapability(request);
    const correlationKey = process.env.NAGARIK_SECURITY_CORRELATION_KEY;
    if (!correlationKey) return failure(requestId, 'signals_unavailable', 503);
    const result = await retractPublicSignal(
      {
        publicId,
        capability: {
          organizationId: capability.organizationId,
          capabilityId: capability.capabilityId,
          subjectId: capability.subjectId,
          keyVersion: capability.keyVersion,
        },
      },
      { transaction: runDatabaseTransaction, correlationKey },
    );
    return NextResponse.json(
      {
        ok: true,
        requestId,
        data: {
          retracted: true,
          signalCount: result.signalCount,
          meaning: 'attention_signal_not_identity_or_truth',
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          ...(result.replayed ? { 'Idempotency-Replayed': 'true' } : {}),
        },
      },
    );
  } catch (error) {
    if (error instanceof SignalAuthorizationError) {
      return failure(requestId, error.code, error.status);
    }
    if (error instanceof SignalError) return failure(requestId, error.code, error.status);
    const security = securityErrorResponse(error);
    if (security) return failure(requestId, security.code, security.status);
    if (error instanceof Error && error.message === 'idempotency_key_required') {
      return failure(requestId, error.message, 400);
    }
    return failure(requestId, 'signals_unavailable', 503);
  }
}
