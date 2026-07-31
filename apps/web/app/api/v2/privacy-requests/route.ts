import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { readJsonLimited, RequestBodyError } from '@/lib/api/requestBody';
import { runDatabaseTransaction } from '@/lib/db/transaction';
import { capabilityKeysFromEnvironment } from '@/lib/security/capabilityTokens';
import { requireIdempotencyKey } from '@/lib/security/ids';
import { IntakeAuthorizationError, requireIntakeCapability } from '@/lib/security/intakeCapability';
import { assertTrustedMutation, securityErrorResponse } from '@/lib/security/request';
import {
  createPrivacyRequest,
  parsePrivacyRequestInput,
  PrivacyRequestError,
} from '@/lib/services/privacyRequests';

export const runtime = 'nodejs';

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

function submissionTrackingToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('NagarikTracking ')) {
    return authorization.slice('NagarikTracking '.length);
  }
  return (
    cookieValue(request, '__Host-nagarik-tracking') ??
    (process.env.NODE_ENV === 'production' ? null : cookieValue(request, 'nagarik-tracking'))
  );
}

function failure(requestId: string, code: string, status: number, retryable = false) {
  return NextResponse.json(
    {
      ok: false,
      requestId,
      error: {
        code,
        message: 'The private request could not be accepted.',
        retryable,
      },
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const requestId = `req_${randomUUID()}`;
  try {
    assertTrustedMutation(request, { maxBytes: 16 * 1024 });
    const idempotencyKey = requireIdempotencyKey(request);
    const intake = await requireIntakeCapability(request);
    const privacyRequest = parsePrivacyRequestInput(
      await readJsonLimited<unknown>(request, 16 * 1024),
    );
    const correlationKey = process.env.NAGARIK_SECURITY_CORRELATION_KEY;
    if (!correlationKey) throw new Error('operator_correlation_key_missing');
    const result = await createPrivacyRequest(
      {
        intake,
        idempotencyKey,
        request: privacyRequest,
        submissionTrackingToken: submissionTrackingToken(request),
      },
      {
        transaction: runDatabaseTransaction,
        keys: capabilityKeysFromEnvironment(),
        correlationKey,
      },
    );
    const response = NextResponse.json(
      {
        ok: true,
        requestId,
        data: {
          privacyRequestId: `prv_${result.privacyRequestId}`,
          recoveryToken: result.recoveryToken,
          state: result.state,
          receivedAt: result.receivedAt,
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
      process.env.NODE_ENV === 'production' ? '__Host-nagarik-privacy' : 'nagarik-privacy',
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
    if (error instanceof RequestBodyError || error instanceof PrivacyRequestError) {
      const status = error instanceof RequestBodyError ? error.status : error.status;
      const code = error instanceof PrivacyRequestError ? error.code : 'privacy_request_invalid';
      return failure(requestId, code, status);
    }
    const security = securityErrorResponse(error);
    if (security) return failure(requestId, security.code, security.status);
    if (error instanceof Error && error.message === 'idempotency_key_required') {
      return failure(requestId, error.message, 400);
    }
    return failure(requestId, 'privacy_request_unavailable', 503, true);
  }
}
