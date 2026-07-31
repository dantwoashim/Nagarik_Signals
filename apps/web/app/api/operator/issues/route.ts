import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { validUuid, operatorWorkflowFailure } from '@/lib/api/operatorWorkflow';
import { requireOperator } from '@/lib/auth/operator';
import { databaseExecutor } from '@/lib/db/transaction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = `req_${randomUUID()}`;
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get('organizationId') ?? '';
    if (!validUuid(organizationId)) {
      return NextResponse.json(
        { ok: false, requestId, error: { code: 'organization_required', retryable: false } },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    await requireOperator({
      organizationId,
      roles: ['moderator', 'steward', 'privacy_reviewer', 'auditor', 'org_admin'],
    });
    const requestedLimit = Number(url.searchParams.get('limit') ?? 50);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
      return NextResponse.json(
        { ok: false, requestId, error: { code: 'operator_issue_limit_invalid' } },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const rows = await databaseExecutor().query(
      `select
         issue.public_id,
         issue.publication_state,
         issue.lifecycle,
         issue.domain_version,
         issue.blocked_from_sequence,
         issue.updated_at,
         version.title,
         version.category,
         version.ward_label,
         count(signal.id) filter (where signal.state = 'active') as signal_count
       from nagarik.issues issue
       join nagarik.issue_versions version on version.id = issue.current_version_id
       left join nagarik.signals signal on signal.issue_id = issue.id
       where issue.organization_id = $1::uuid
         and issue.workflow_version = 'v2'
         and issue.publication_state in ('published', 'superseded', 'removed')
       group by issue.id, version.id
       order by issue.updated_at desc, issue.public_id
       limit $2`,
      [organizationId, requestedLimit],
    );
    return NextResponse.json(
      {
        ok: true,
        requestId,
        data: {
          items: rows.map((row) => ({
            publicId: row.public_id,
            publicationState: row.publication_state,
            lifecycle: row.lifecycle,
            domainVersion: Number(row.domain_version),
            blockedFromSequence:
              row.blocked_from_sequence === null ? null : Number(row.blocked_from_sequence),
            title: row.title,
            category: row.category,
            wardLabel: row.ward_label,
            signalCount: Number(row.signal_count),
            updatedAt: new Date(String(row.updated_at)).toISOString(),
          })),
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = operatorWorkflowFailure(requestId, error);
    if (mapped) return mapped;
    return NextResponse.json(
      { ok: false, requestId, error: { code: 'operator_issues_unavailable', retryable: true } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
