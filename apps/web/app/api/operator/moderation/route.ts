import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { requireOperator } from '@/lib/auth/operator';
import { getDatabase } from '@/lib/db/postgres';
import { listModerationQueue } from '@/lib/db/repositories/submissions';
import { validUuid, operatorWorkflowFailure } from '@/lib/api/operatorWorkflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Cursor = { receivedAt: string; id: string };

function parseCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    if (
      !parsed ||
      !validUuid(parsed.id) ||
      new Date(parsed.receivedAt).toISOString() !== parsed.receivedAt
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const requestId = `req_${randomUUID()}`;
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get('organizationId') ?? '';
    if (!validUuid(organizationId)) {
      return NextResponse.json(
        { ok: false, requestId, error: { code: 'organization_required' } },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    await requireOperator({
      organizationId,
      roles: ['moderator', 'privacy_reviewer', 'auditor', 'org_admin'],
    });
    const requestedLimit = Number(url.searchParams.get('limit') ?? 25);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 50) {
      throw new Error('moderation_limit_invalid');
    }
    const cursorValue = url.searchParams.get('cursor');
    const cursor = parseCursor(cursorValue);
    if (cursorValue && !cursor) throw new Error('moderation_cursor_invalid');
    const rows = await listModerationQueue(getDatabase(), {
      organizationId,
      limit: requestedLimit + 1,
      ...(cursor ? { afterReceivedAt: new Date(cursor.receivedAt), afterId: cursor.id } : {}),
    });
    const hasMore = rows.length > requestedLimit;
    const items = rows.slice(0, requestedLimit);
    const last = items.at(-1);
    return NextResponse.json(
      {
        ok: true,
        requestId,
        data: {
          items: items.map((item) => ({
            submissionId: item.id,
            trackingId: item.tracking_id,
            recordKind: item.record_kind,
            state: item.state,
            version: Number(item.version),
            assignedTo: item.assigned_to,
            receivedAt: item.received_at.toISOString(),
            updatedAt: item.updated_at.toISOString(),
          })),
          nextCursor:
            hasMore && last
              ? Buffer.from(
                  JSON.stringify({
                    receivedAt: last.received_at.toISOString(),
                    id: last.id,
                  }),
                  'utf8',
                ).toString('base64url')
              : null,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const mapped = operatorWorkflowFailure(requestId, error);
    if (mapped) return mapped;
    return NextResponse.json(
      { ok: false, requestId, error: { code: 'moderation_queue_unavailable' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
