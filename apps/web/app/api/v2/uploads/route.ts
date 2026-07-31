import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { readSingleMultipartFile, RequestBodyError } from '@/lib/api/requestBody';
import { runDatabaseTransaction } from '@/lib/db/transaction';
import { assertTrustedMutation, securityErrorResponse } from '@/lib/security/request';
import { capabilityKeysFromEnvironment } from '@/lib/security/capabilityTokens';
import { requireIdempotencyKey } from '@/lib/security/ids';
import { IntakeAuthorizationError, requireIntakeCapability } from '@/lib/security/intakeCapability';
import { createStagedUpload, UploadTransactionError } from '@/lib/services/uploads';
import { deletePrivateObject, stagePrivateObject } from '@/lib/storage/privateStorage';
import { sanitizeImage } from '@/lib/storage/sanitizeImage';

export const runtime = 'nodejs';

const maximumMultipartBytes = 10 * 1024 * 1024 + 128 * 1024;

function failure(requestId: string, code: string, status: number, retryable = false) {
  return NextResponse.json(
    {
      ok: false,
      requestId,
      error: {
        code,
        message: 'The private image could not be staged.',
        retryable,
      },
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const requestId = `req_${randomUUID()}`;

  try {
    assertTrustedMutation(request, { maxBytes: maximumMultipartBytes });
    const idempotencyKey = requireIdempotencyKey(request);
    const intake = await requireIntakeCapability(request);
    const file = await readSingleMultipartFile(request, {
      maximumBytes: maximumMultipartBytes,
      fieldName: 'file',
    });
    const normalized = await sanitizeImage(file);
    const result = await createStagedUpload(
      { intake, idempotencyKey, normalized },
      {
        stage: stagePrivateObject,
        remove: deletePrivateObject,
        transaction: runDatabaseTransaction,
        keys: capabilityKeysFromEnvironment(),
        correlationKey: process.env.NAGARIK_SECURITY_CORRELATION_KEY!,
      },
    );

    return NextResponse.json(
      {
        ok: true,
        requestId,
        data: {
          mediaId: `med_${result.mediaId}`,
          receipt: result.receipt,
          expiresAt: result.expiresAt,
          normalization: result.normalization,
          reviewState: result.reviewState,
        },
      },
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store',
          ...(result.replayed ? { 'Idempotency-Replayed': 'true' } : {}),
        },
      },
    );
  } catch (error) {
    if (error instanceof IntakeAuthorizationError) {
      return failure(requestId, error.code, error.status, error.status === 503);
    }
    if (error instanceof RequestBodyError) {
      const code =
        error.code === 'request_too_large'
          ? 'upload_too_large'
          : error.code === 'request_body_missing'
            ? 'upload_missing'
            : 'upload_missing';
      return failure(requestId, code, error.status);
    }
    if (error instanceof UploadTransactionError) {
      return failure(requestId, error.code, error.status, error.status === 503);
    }
    const security = securityErrorResponse(error);
    if (security) return failure(requestId, security.code, security.status);
    if (error instanceof Error && error.message === 'idempotency_key_required') {
      return failure(requestId, error.message, 400);
    }
    const stableUploadErrors = new Set([
      'upload_missing',
      'upload_too_large',
      'decoded_image_too_large',
      'unsupported_image',
      'animated_or_multipage_image',
      'malformed_image',
      'normalized_image_too_large',
    ]);
    if (error instanceof Error && stableUploadErrors.has(error.message)) {
      return failure(requestId, error.message, 400);
    }
    return failure(requestId, 'media_storage_unavailable', 503, true);
  }
}
