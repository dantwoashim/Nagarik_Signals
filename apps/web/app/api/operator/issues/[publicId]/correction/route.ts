import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { readJsonLimited } from '@/lib/api/requestBody';
import {
  operatorWorkflowFailure,
  requiredCorrelationKey,
  requireIssueOperator,
} from '@/lib/api/operatorWorkflow';
import { runDatabaseTransaction } from '@/lib/db/transaction';
import { requireIdempotencyKey } from '@/lib/security/ids';
import { assertTrustedMutation, securityErrorResponse } from '@/lib/security/request';
import { correctPublishedIssue, parseCorrectionInput } from '@/lib/services/publication';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const requestId = `req_${randomUUID()}`;
  try {
    assertTrustedMutation(request, { maxBytes: 32 * 1024 });
    const idempotencyKey = requireIdempotencyKey(request);
    const { publicId } = await params;
    const operator = await requireIssueOperator(publicId, [
      'moderator',
      'privacy_reviewer',
      'org_admin',
    ]);
    const correction = parseCorrectionInput(await readJsonLimited<unknown>(request, 32 * 1024));
    const result = await correctPublishedIssue(
      {
        publicId,
        idempotencyKey,
        actor: { subjectId: operator.user.id, organizationId: operator.organizationId! },
        correction,
      },
      { transaction: runDatabaseTransaction, correlationKey: requiredCorrelationKey() },
    );
    return NextResponse.json(
      { ok: true, requestId, data: result },
      {
        status: 202,
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
        { ok: false, requestId, error: { code: security.code } },
        { status: security.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { ok: false, requestId, error: { code: 'correction_unavailable', retryable: true } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
