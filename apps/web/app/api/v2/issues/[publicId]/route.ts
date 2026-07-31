import { NextResponse } from 'next/server';

import { getDatabase } from '@/lib/db/postgres';
import {
  findPublicIssue,
  findPublicIssueProof,
  listPublicIssueEvents,
} from '@/lib/db/repositories/publicIssues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function notFound() {
  return NextResponse.json(
    { ok: false, error: { code: 'issue_not_found', retryable: false } },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await params;
  if (!publicIdPattern.test(publicId) || process.env.NAGARIK_CAP_PUBLIC_READ !== 'true') {
    return notFound();
  }
  try {
    const sql = getDatabase();
    const issue = await findPublicIssue(sql, publicId);
    if (!issue) return notFound();
    const proof = await findPublicIssueProof(sql, publicId);
    if (issue.publication_state === 'removed') {
      return NextResponse.json(
        {
          ok: true,
          data: {
            publicId,
            publicationState: 'removed',
            tombstone: issue.tombstone,
            proofAvailable: Boolean(proof),
            updatedAt: issue.updated_at.toISOString(),
          },
        },
        { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } },
      );
    }
    if (issue.access_restricted) {
      return NextResponse.json(
        {
          ok: true,
          data: {
            publicId,
            publicationState: 'removed',
            tombstone: {
              schemaVersion: 'nagarik-tombstone-v1',
              reasonCode: 'privacy_review',
              publicMessage: 'This record is unavailable while a privacy review is in progress.',
            },
            proofAvailable: false,
            updatedAt: issue.updated_at.toISOString(),
          },
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const events = await listPublicIssueEvents(sql, publicId);
    return NextResponse.json(
      {
        ok: true,
        data: {
          publicId,
          workflowVersion: issue.workflow_version,
          publicationState: issue.publication_state,
          versionId: issue.version_id,
          title: issue.title,
          summary: issue.summary,
          narrative: issue.narrative,
          category: issue.category,
          ward: issue.ward,
          location: issue.location,
          mediaUrl: issue.media_id ? `/api/media/med_${issue.media_id}` : null,
          provenance: issue.provenance,
          lifecycle: issue.lifecycle,
          legacyStatus: issue.legacy_status,
          signalCount: Number(issue.signal_count),
          publishedAt: issue.published_at?.toISOString() ?? null,
          updatedAt: issue.updated_at.toISOString(),
          proofAvailable: Boolean(proof),
          events: events.map((event) => ({
            id: event.event_id,
            type: event.event_type,
            chainSequence: event.chain_sequence === null ? null : Number(event.chain_sequence),
            data: event.public_event,
            occurredAt: event.occurred_at.toISOString(),
          })),
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=15, s-maxage=30, stale-while-revalidate=60',
        },
      },
    );
  } catch {
    return notFound();
  }
}
