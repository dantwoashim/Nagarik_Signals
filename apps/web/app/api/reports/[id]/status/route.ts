import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'v1_shared_secret_status_retired',
      replacement: '/api/operator/issues/{publicId}/lifecycle',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
