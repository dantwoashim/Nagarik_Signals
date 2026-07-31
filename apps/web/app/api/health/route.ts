import { NextResponse } from 'next/server';

import { deploymentRelease } from '@/lib/ops/readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const release = deploymentRelease(process.env);
  return NextResponse.json(
    {
      ok: true,
      status: 'live',
      release: {
        environment: release.environment,
        commitSha: release.commitSha,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
