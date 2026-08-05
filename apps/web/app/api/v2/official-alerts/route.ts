import { NextResponse } from 'next/server';

import { readOfficialAlerts } from '@/lib/public/officialAlerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.NAGARIK_CAP_PUBLIC_READ !== 'true') {
    return NextResponse.json(
      { ok: false, error: { code: 'official_alerts_unavailable', retryable: true } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  try {
    const checkedAt = new Date();
    const items = await readOfficialAlerts(checkedAt);
    return NextResponse.json(
      { ok: true, data: { items, checkedAt: checkedAt.toISOString() } },
      {
        headers: {
          'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
        },
      },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'official_alerts_unavailable', retryable: true } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
