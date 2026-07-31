import { NextResponse } from 'next/server';

import { listIssues } from '@/lib/db/queries';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const cursor = Number(url.searchParams.get('cursor') ?? 0);
  const scope = url.searchParams.get('scope') === 'samples' ? 'samples' : 'public';
  const issues = await listIssues({
    scope,
    ward: url.searchParams.get('ward'),
    category: url.searchParams.get('category'),
    status: url.searchParams.get('status'),
    sort: url.searchParams.get('sort'),
    limit,
    cursor,
  });
  return NextResponse.json(
    {
      ok: true,
      mode: 'v1_legacy_read',
      scope,
      issues,
      nextCursor: issues.length === limit ? cursor + limit : null,
    },
    { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' } },
  );
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'v1_legacy_mutations_retired',
      replacement: '/api/v2/submissions',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
