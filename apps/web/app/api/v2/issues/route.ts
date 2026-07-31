import { NextResponse } from 'next/server';

import { getDatabase } from '@/lib/db/postgres';
import { listPublicIssues } from '@/lib/db/repositories/publicIssues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Cursor = { publishedAt: string; publicId: string };

function parseCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    if (
      !parsed ||
      !publicIdPattern.test(parsed.publicId) ||
      new Date(parsed.publishedAt).toISOString() !== parsed.publishedAt
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function unavailable(status = 503) {
  return NextResponse.json(
    { ok: false, error: { code: 'public_issues_unavailable', retryable: status === 503 } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request: Request) {
  if (process.env.NAGARIK_CAP_PUBLIC_READ !== 'true') return unavailable();
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get('limit') ?? 20);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 50) {
    return unavailable(400);
  }
  const cursorValue = url.searchParams.get('cursor');
  const cursor = parseCursor(cursorValue);
  if (cursorValue && !cursor) return unavailable(400);
  try {
    const sql = getDatabase();
    const switches = await sql<{ enabled: boolean }[]>`
      select nagarik.is_capability_enabled('publicReadEnabled') as enabled
    `;
    if (switches[0]?.enabled !== true) return unavailable();
    const rows = await listPublicIssues(sql, {
      limit: requestedLimit + 1,
      ...(cursor
        ? {
            beforePublishedAt: new Date(cursor.publishedAt),
            beforePublicId: cursor.publicId,
          }
        : {}),
    });
    const hasMore = rows.length > requestedLimit;
    const items = rows.slice(0, requestedLimit);
    const last = items.at(-1);
    return NextResponse.json(
      {
        ok: true,
        data: {
          items: items.map((issue) => ({
            publicId: issue.public_id,
            workflowVersion: issue.workflow_version,
            publicationState: issue.publication_state,
            title: issue.title,
            summary: issue.summary,
            category: issue.category,
            ward: issue.ward,
            location: issue.location,
            mediaUrl: issue.media_id ? `/api/media/med_${issue.media_id}` : null,
            lifecycle: issue.lifecycle,
            legacyStatus: issue.legacy_status,
            signalCount: Number(issue.signal_count),
            publishedAt: issue.published_at?.toISOString() ?? null,
            updatedAt: issue.updated_at.toISOString(),
          })),
          nextCursor:
            hasMore && last?.published_at
              ? encodeCursor({
                  publishedAt: last.published_at.toISOString(),
                  publicId: last.public_id,
                })
              : null,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=15, s-maxage=30, stale-while-revalidate=60',
        },
      },
    );
  } catch {
    return unavailable();
  }
}
