import { NextResponse } from 'next/server';

import { createConfiguredChainSigner } from '@/lib/chain/configuredSigner';
import { processChainOutboxBatch } from '@/lib/chain/outboxWorker';
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
    if (env.NAGARIK_CAP_V2_WRITES !== 'true') return unavailable(503);

    const query = databaseExecutor();
    const enabled = await query.query(
      `select nagarik.is_capability_enabled('v2WritesEnabled') as enabled`,
    );
    if (enabled[0]?.enabled !== true) return unavailable(503);
    const signer = await createConfiguredChainSigner(env);
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 10);
    const result = await processChainOutboxBatch(
      {
        query,
        transaction: runDatabaseTransaction,
        signer,
        workerId: `outbox:${env.NEXT_PUBLIC_RELEASE_ID ?? 'local'}`,
      },
      limit,
    );
    return NextResponse.json(
      { ok: true, data: result },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return unavailable(503);
  }
}
