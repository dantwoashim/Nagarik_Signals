import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { readJsonLimited } from '@/lib/api/requestBody';
import {
  operatorWorkflowFailure,
  requiredCorrelationKey,
  requireMediaOperator,
} from '@/lib/api/operatorWorkflow';
import { runDatabaseTransaction } from '@/lib/db/transaction';
import { requireIdempotencyKey } from '@/lib/security/ids';
import { assertTrustedMutation, securityErrorResponse } from '@/lib/security/request';
import { createPublicDerivative, parsePublicDerivativeInput } from '@/lib/services/mediaWorkflow';
import { configuredStorageMode } from '@/lib/storage/media';
import {
  deletePrivateObject,
  readPrivateObject,
  writePrivateObject,
} from '@/lib/storage/privateStorage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function durablePrefix(): string {
  const value = process.env.NAGARIK_BLOB_DURABLE_PREFIX;
  if (!value) throw new Error('NAGARIK_BLOB_DURABLE_PREFIX_missing');
  return value;
}

export async function POST(request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const requestId = `req_${randomUUID()}`;
  try {
    assertTrustedMutation(request, { maxBytes: 24 * 1024 });
    const idempotencyKey = requireIdempotencyKey(request);
    const { mediaId } = await params;
    const operator = await requireMediaOperator(mediaId, ['moderator', 'org_admin']);
    const derivative = parsePublicDerivativeInput(
      await readJsonLimited<unknown>(request, 24 * 1024),
    );
    const result = await createPublicDerivative(
      {
        sourceMediaId: mediaId,
        idempotencyKey,
        actor: {
          subjectId: operator.user.id,
          organizationId: operator.organizationId!,
        },
        derivative,
      },
      {
        transaction: runDatabaseTransaction,
        correlationKey: requiredCorrelationKey(),
        durablePrefix: durablePrefix(),
        storageMode: configuredStorageMode(),
        read: readPrivateObject,
        write: writePrivateObject,
        remove: deletePrivateObject,
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
        error: { code: 'public_derivative_unavailable', retryable: true },
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
