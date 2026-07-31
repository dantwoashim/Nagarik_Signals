import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { readJsonLimited, RequestBodyError } from '@/lib/api/requestBody';
import { runDatabaseTransaction } from '@/lib/db/transaction';
import { capabilityKeysFromEnvironment } from '@/lib/security/capabilityTokens';
import { requireIdempotencyKey } from '@/lib/security/ids';
import { assertTrustedMutation, securityErrorResponse } from '@/lib/security/request';
import {
  consumePilotInvitation,
  parseIntakeSessionInput,
  PilotInvitationError,
} from '@/lib/services/pilotInvitations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieName(production: string, development: string): string {
  return process.env.NODE_ENV === 'production' ? production : development;
}

function failure(requestId: string, code: string, status: number) {
  return NextResponse.json(
    { ok: false, requestId, error: { code, retryable: status === 503 } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const requestId = `req_${randomUUID()}`;
  try {
    assertTrustedMutation(request, { maxBytes: 4 * 1024 });
    const idempotencyKey = requireIdempotencyKey(request);
    const session = parseIntakeSessionInput(await readJsonLimited<unknown>(request, 4 * 1024));
    const correlationKey = process.env.NAGARIK_SECURITY_CORRELATION_KEY;
    if (!correlationKey) return failure(requestId, 'pilot_invitation_unavailable', 503);
    const result = await consumePilotInvitation(
      { idempotencyKey, session },
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
        data: { scope: result.scopes, expiresAt: result.expiresAt },
      },
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store',
          ...(result.replayed ? { 'Idempotency-Replayed': 'true' } : {}),
        },
      },
    );
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
      expires: new Date(result.expiresAt),
    };
    if (result.intakeToken) {
      response.cookies.set(
        cookieName('__Host-nagarik-pilot', 'nagarik-pilot'),
        result.intakeToken,
        cookieOptions,
      );
    }
    if (result.signalToken) {
      response.cookies.set(
        cookieName('__Host-nagarik-signal-context', 'nagarik-signal-context'),
        result.signalToken,
        cookieOptions,
      );
    }
    return response;
  } catch (error) {
    if (error instanceof PilotInvitationError) {
      return failure(requestId, error.code, error.status);
    }
    if (error instanceof RequestBodyError) {
      return failure(requestId, 'pilot_invitation_invalid', error.status);
    }
    const security = securityErrorResponse(error);
    if (security) return failure(requestId, security.code, security.status);
    if (error instanceof Error && error.message === 'idempotency_key_required') {
      return failure(requestId, error.message, 400);
    }
    return failure(requestId, 'pilot_invitation_unavailable', 503);
  }
}
