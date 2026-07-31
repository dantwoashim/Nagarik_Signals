import { NextResponse } from 'next/server';

import { getDatabase } from '@/lib/db/postgres';
import { getPublicIssueStats } from '@/lib/db/repositories/publicIssues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unavailable() {
  return NextResponse.json(
    { ok: false, error: { code: 'public_stats_unavailable', retryable: true } },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET() {
  if (process.env.NAGARIK_CAP_PUBLIC_READ !== 'true') return unavailable();
  try {
    const sql = getDatabase();
    const switches = await sql<{ enabled: boolean }[]>`
      select nagarik.is_capability_enabled('publicReadEnabled') as enabled
    `;
    if (switches[0]?.enabled !== true) return unavailable();
    const result = await getPublicIssueStats(sql);
    return NextResponse.json(
      {
        ok: true,
        data: {
          total: Number(result.totals.total),
          open: Number(result.totals.open),
          inProgress: Number(result.totals.in_progress),
          resolved: Number(result.totals.resolved),
          closed: Number(result.totals.closed),
          signals: Number(result.totals.signals),
          categories: result.categories.map((item) => ({
            category: item.category,
            total: Number(item.total),
          })),
          wards: result.wards.map((item) => ({
            id: item.id,
            label: item.label,
            total: Number(item.total),
          })),
          updatedAt: result.totals.updated_at?.toISOString() ?? null,
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
