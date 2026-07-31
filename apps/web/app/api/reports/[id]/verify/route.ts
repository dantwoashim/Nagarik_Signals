import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'v1_session_verification_retired',
      replacement: '/api/v2/issues/{publicId}/signals',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
