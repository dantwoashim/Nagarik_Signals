import 'server-only';

import { NextResponse } from 'next/server';

import {
  OperatorAuthorizationError,
  requireOperator,
  type OperatorContext,
} from '@/lib/auth/operator';
import type { OperatorRole } from '@/lib/auth/policy';
import { databaseExecutor } from '@/lib/db/transaction';
import { RequestBodyError } from '@/lib/api/requestBody';
import { HandoffError } from '@/lib/services/handoffs';
import { MediaWorkflowError } from '@/lib/services/mediaWorkflow';
import { ModerationError } from '@/lib/services/moderation';
import { OperatorMutationError } from '@/lib/services/operatorMutation';
import { PilotInvitationError } from '@/lib/services/pilotInvitations';
import { PublicationError } from '@/lib/services/publication';
import { PrivacyRequestError } from '@/lib/services/privacyRequests';
import { LifecycleError } from '@/lib/services/status';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function validUuid(value: string): boolean {
  return uuidPattern.test(value);
}

async function organizationFor(
  resource: 'submission' | 'issue' | 'media' | 'privacy_request',
  id: string,
): Promise<string | null> {
  if (!validUuid(id)) return null;
  const rows =
    resource === 'submission'
      ? await databaseExecutor().query(
          `select organization_id
           from nagarik.submissions
           where id = $1::uuid
           limit 1`,
          [id],
        )
      : resource === 'issue'
        ? await databaseExecutor().query(
            `select organization_id
           from nagarik.issues
           where public_id = $1::uuid
           limit 1`,
            [id],
          )
        : resource === 'media'
          ? await databaseExecutor().query(
              `select organization_id
             from nagarik.media_objects
             where id = $1::uuid
             limit 1`,
              [id],
            )
          : await databaseExecutor().query(
              `select organization_id
               from nagarik.privacy_requests
               where id = $1::uuid
               limit 1`,
              [id],
            );
  return rows[0]?.organization_id ? String(rows[0].organization_id) : null;
}

export async function requireSubmissionOperator(
  submissionId: string,
  roles: readonly OperatorRole[],
): Promise<OperatorContext> {
  const organizationId = await organizationFor('submission', submissionId);
  if (!organizationId) throw new OperatorMutationError('resource_not_found', 404);
  return requireOperator({ organizationId, roles });
}

export async function requireIssueOperator(
  publicId: string,
  roles: readonly OperatorRole[],
  options: { allowSystemAdminOverride?: boolean } = {},
): Promise<OperatorContext> {
  const organizationId = await organizationFor('issue', publicId);
  if (!organizationId) throw new OperatorMutationError('resource_not_found', 404);
  return requireOperator({ organizationId, roles, ...options });
}

export async function requirePrivacyRequestOperator(
  privacyRequestId: string,
): Promise<OperatorContext> {
  const organizationId = await organizationFor('privacy_request', privacyRequestId);
  if (!organizationId) throw new OperatorMutationError('resource_not_found', 404);
  return requireOperator({
    organizationId,
    roles: ['privacy_reviewer'],
    allowSystemAdminOverride: false,
  });
}

export async function requireMediaOperator(
  mediaId: string,
  roles: readonly OperatorRole[],
): Promise<OperatorContext> {
  const organizationId = await organizationFor('media', mediaId);
  if (!organizationId) throw new OperatorMutationError('resource_not_found', 404);
  return requireOperator({ organizationId, roles });
}

export function requiredCorrelationKey(): string {
  if (process.env.NAGARIK_CAP_OPERATOR_MUTATIONS !== 'true') {
    throw new OperatorMutationError('operator_mutations_disabled', 503);
  }
  const value = process.env.NAGARIK_SECURITY_CORRELATION_KEY;
  if (!value) throw new Error('operator_correlation_key_missing');
  return value;
}

export function operatorWorkflowFailure(requestId: string, error: unknown): NextResponse | null {
  if (error instanceof OperatorAuthorizationError) {
    const status = error.code === 'operator_authentication_required' ? 401 : 403;
    return NextResponse.json(
      { ok: false, requestId, error: { code: error.code, retryable: false } },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (
    error instanceof OperatorMutationError ||
    error instanceof ModerationError ||
    error instanceof MediaWorkflowError ||
    error instanceof PilotInvitationError ||
    error instanceof PrivacyRequestError ||
    error instanceof LifecycleError ||
    error instanceof HandoffError ||
    error instanceof PublicationError
  ) {
    return NextResponse.json(
      {
        ok: false,
        requestId,
        error: { code: error.code, retryable: error.status === 503 },
      },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (error instanceof RequestBodyError) {
    return NextResponse.json(
      { ok: false, requestId, error: { code: error.code, retryable: false } },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (error instanceof Error && error.message === 'idempotency_key_required') {
    return NextResponse.json(
      {
        ok: false,
        requestId,
        error: { code: 'idempotency_key_required', retryable: false },
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return null;
}
