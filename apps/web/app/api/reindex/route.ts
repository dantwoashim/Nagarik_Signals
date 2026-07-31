import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'legacy_reindex_retired',
      replacement: '/api/internal/reconcile',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
