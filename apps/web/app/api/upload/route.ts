import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'legacy_upload_retired',
      replacement: '/api/v2/uploads',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
