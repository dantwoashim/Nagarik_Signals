import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { readJsonLimited, RequestBodyError } from '@/lib/api/requestBody';
import { runDatabaseTransaction } from '@/lib/db/transaction';
import { LocationPolicyError } from '@/lib/geo/pilotGeometry';
import { capabilityKeysFromEnvironment } from '@/lib/security/capabilityTokens';
import { requireIdempotencyKey } from '@/lib/security/ids';
import { IntakeAuthorizationError, requireIntakeCapability } from '@/lib/security/intakeCapability';
import { assertTrustedMutation, securityErrorResponse } from '@/lib/security/request';
import { parseSubmissionInput, SubmissionInputError } from '@/lib/services/submissionInput';
import { createPrivateSubmission, SubmissionTransactionError } from '@/lib/services/submissions';

export const runtime = 'nodejs';

function failure(requestId: string, code: string, status: number, retryable = false) {
  return NextResponse.json(
    {
      ok: false,
      requestId,
      error: {
        code,
        message: 'The private report could not be accepted.',
        retryable,
      },
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function requiredServerSetting(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_missing`);
  return value;
}

export async function POST(request: Request) {
  const requestId = `req_${randomUUID()}`;

  try {
    assertTrustedMutation(request, { maxBytes: 64 * 1024 });
    const idempotencyKey = requireIdempotencyKey(request);
    const intake = await requireIntakeCapability(request);
    const raw = await readJsonLimited<unknown>(request, 64 * 1024);
    const submission = parseSubmissionInput(raw);
    const result = await createPrivateSubmission(
      { intake, idempotencyKey, submission },
      {
        transaction: runDatabaseTransaction,
        keys: capabilityKeysFromEnvironment(),
        correlationKey: requiredServerSetting('NAGARIK_SECURITY_CORRELATION_KEY'),
        durablePrefix: requiredServerSetting('NAGARIK_BLOB_DURABLE_PREFIX'),
      },
    );

    const response = NextResponse.json(
      {
        ok: true,
        requestId,
        data: {
          trackingId: `trk_${result.trackingId}`,
          recoveryToken: result.recoveryToken,
          state: result.state,
          receivedAt: result.receivedAt,
          media: result.media,
          next: result.next,
        },
      },
      {
        status: 202,
        headers: {
          'Cache-Control': 'no-store',
          ...(result.replayed ? { 'Idempotency-Replayed': 'true' } : {}),
        },
      },
    );
    response.cookies.set(
      process.env.NODE_ENV === 'production' ? '__Host-nagarik-tracking' : 'nagarik-tracking',
      result.recoveryToken,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        expires: new Date(result.trackingExpiresAt),
      },
    );
    return response;
  } catch (error) {
    if (error instanceof IntakeAuthorizationError) {
      return failure(requestId, error.code, error.status, error.status === 503);
    }
    if (error instanceof RequestBodyError) {
      return failure(requestId, 'submission_invalid', error.status);
    }
    if (error instanceof SubmissionInputError) {
      return failure(requestId, error.code, 400);
    }
    if (error instanceof SubmissionTransactionError) {
      return failure(requestId, error.code, error.status, error.status === 503);
    }
    if (error instanceof LocationPolicyError) {
      return failure(requestId, error.code, 400);
    }
    const security = securityErrorResponse(error);
    if (security) return failure(requestId, security.code, security.status);
    if (error instanceof Error && error.message === 'idempotency_key_required') {
      return failure(requestId, error.message, 400);
    }
    return failure(requestId, 'submission_unavailable', 503, true);
  }
}
