import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function retired() {
  return NextResponse.json(
    {
      ok: false,
      error: 'legacy_handoff_retired',
      replacement: '/api/operator/issues/{publicId}/handoff',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET() {
  return retired();
}

export async function POST() {
  return retired();
}
