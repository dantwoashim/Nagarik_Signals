import { NextResponse } from 'next/server';

import { createConfiguredChainSigner } from '@/lib/chain/configuredSigner';
import { reconcileChainOutbox } from '@/lib/chain/reconciler';
import { databaseExecutor, runDatabaseTransaction } from '@/lib/db/transaction';
import { getServerEnvironment } from '@/lib/env/server';
import { isAuthorizedWorkerRequest } from '@/lib/security/workerAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unavailable(status = 404) {
  return NextResponse.json(
    { ok: false, error: 'worker_unavailable' },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  try {
    const env = getServerEnvironment();
    if (
      !env.NAGARIK_WORKER_AUTH_SECRET ||
      !isAuthorizedWorkerRequest(request, env.NAGARIK_WORKER_AUTH_SECRET)
    ) {
      return unavailable();
    }
    const url = new URL(request.url);
    const dryRun = url.searchParams.get('apply') !== 'true';
    if (!dryRun && env.NAGARIK_CAP_V2_WRITES !== 'true') return unavailable(503);
    const query = databaseExecutor();
    if (!dryRun) {
      const enabled = await query.query(
        `select nagarik.is_capability_enabled('v2WritesEnabled') as enabled`,
      );
      if (enabled[0]?.enabled !== true) return unavailable(503);
    }
    const signer = await createConfiguredChainSigner(env);
    const result = await reconcileChainOutbox(
      {
        query,
        transaction: runDatabaseTransaction,
        signer,
        workerId: `reconcile:${env.NEXT_PUBLIC_RELEASE_ID ?? 'local'}`,
      },
      {
        dryRun,
        limit: Number(url.searchParams.get('limit') ?? 25),
      },
    );
    return NextResponse.json(
      { ok: true, data: result },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return unavailable(503);
  }
}
