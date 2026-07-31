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
import { parseMediaReviewInput, reviewPrivateMedia } from '@/lib/services/mediaWorkflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const requestId = `req_${randomUUID()}`;
  try {
    assertTrustedMutation(request, { maxBytes: 8 * 1024 });
    const idempotencyKey = requireIdempotencyKey(request);
    const { mediaId } = await params;
    const operator = await requireMediaOperator(mediaId, ['moderator', 'org_admin']);
    const review = parseMediaReviewInput(await readJsonLimited<unknown>(request, 8 * 1024));
    const result = await reviewPrivateMedia(
      {
        mediaId,
        idempotencyKey,
        actor: {
          subjectId: operator.user.id,
          organizationId: operator.organizationId!,
        },
        review,
      },
      {
        transaction: runDatabaseTransaction,
        correlationKey: requiredCorrelationKey(),
      },
    );
    return NextResponse.json(
      { ok: true, requestId, data: result },
      {
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
      { ok: false, requestId, error: { code: 'media_review_unavailable', retryable: true } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
