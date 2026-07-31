import { NextResponse } from 'next/server';

import { readInternalHealth } from '@/lib/ops/health';
import { deploymentRelease } from '@/lib/ops/readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [snapshot, release] = await Promise.all([
    readInternalHealth(),
    Promise.resolve(deploymentRelease(process.env)),
  ]);
  return NextResponse.json(
    {
      ok: snapshot.ready,
      status: snapshot.ready ? 'ready' : 'not_ready',
      release: {
        environment: release.environment,
        commitSha: release.commitSha,
      },
    },
    {
      status: snapshot.ready ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
