import { NextResponse } from 'next/server';

import { databaseExecutor, runDatabaseTransaction } from '@/lib/db/transaction';
import { getServerEnvironment } from '@/lib/env/server';
import { isAuthorizedWorkerRequest } from '@/lib/security/workerAuth';
import { sweepExpiredMedia } from '@/lib/services/mediaRetention';
import { configuredStorageMode } from '@/lib/storage/media';
import { deletePrivateObject } from '@/lib/storage/privateStorage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unavailable(status = 404) {
  return NextResponse.json(
    { ok: false, error: 'worker_unavailable' },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request: Request) {
  try {
    const env = getServerEnvironment();
    if (
      !env.NAGARIK_WORKER_AUTH_SECRET ||
      !isAuthorizedWorkerRequest(request, env.NAGARIK_WORKER_AUTH_SECRET)
    ) {
      return unavailable();
    }
    if (!env.NAGARIK_SECURITY_CORRELATION_KEY) return unavailable(503);

    const result = await sweepExpiredMedia(
      {
        query: databaseExecutor(),
        transaction: runDatabaseTransaction,
        remove: deletePrivateObject,
        storageMode: configuredStorageMode(),
        correlationKey: env.NAGARIK_SECURITY_CORRELATION_KEY,
      },
      25,
    );
    return NextResponse.json(
      { ok: true, data: result },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return unavailable(503);
  }
}
