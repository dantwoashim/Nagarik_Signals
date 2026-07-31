import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'legacy_moderation_retired',
      replacement: '/api/operator/moderation/{submissionId}',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
