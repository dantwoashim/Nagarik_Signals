import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { requireWorkerCommand, WorkerRequestError } from '@/lib/api/workerRequest';
import { databaseExecutor, runDatabaseTransaction } from '@/lib/db/transaction';
import { getServerEnvironment } from '@/lib/env/server';
import { isAuthorizedScheduledRequest, isAuthorizedWorkerRequest } from '@/lib/security/workerAuth';
import { sweepExpiredMedia } from '@/lib/services/mediaRetention';
import { configuredStorageMode } from '@/lib/storage/media';
import { deletePrivateObject } from '@/lib/storage/privateStorage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const path = '/api/internal/retention';

function unavailable(requestId: string, status = 404, code = 'worker_unavailable') {
  return NextResponse.json(
    { ok: false, requestId, error: { code, retryable: status === 503 } },
    {
      status,
      headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
    },
  );
}

async function retain(request: Request, scheduled: boolean) {
  const requestId = `req_${randomUUID()}`;
  try {
    const env = getServerEnvironment();
    const authorized = scheduled
      ? Boolean(env.CRON_SECRET && isAuthorizedScheduledRequest(request, env.CRON_SECRET, path))
      : Boolean(
          env.NAGARIK_WORKER_AUTH_SECRET &&
          isAuthorizedWorkerRequest(
            request,
            env.NAGARIK_WORKER_AUTH_SECRET,
            'nagarik-worker/retention/v1',
          ),
        );
    if (!authorized) return unavailable(requestId);
    if (!scheduled) await requireWorkerCommand(request, 'retention-worker-v1');
    if (!env.NAGARIK_SECURITY_CORRELATION_KEY) return unavailable(requestId, 503);

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
      { ok: true, requestId, data: result },
      { headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } },
    );
  } catch (error) {
    if (error instanceof WorkerRequestError) {
      return unavailable(requestId, 400, error.message);
    }
    return unavailable(requestId, 503);
  }
}

export async function GET(request: Request) {
  return retain(request, true);
}

export async function POST(request: Request) {
  return retain(request, false);
}
