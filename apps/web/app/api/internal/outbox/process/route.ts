import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { requireWorkerCommand, WorkerRequestError } from '@/lib/api/workerRequest';
import { createConfiguredChainSigner } from '@/lib/chain/configuredSigner';
import { processChainOutboxBatch } from '@/lib/chain/outboxWorker';
import { databaseExecutor, runDatabaseTransaction } from '@/lib/db/transaction';
import { getServerEnvironment } from '@/lib/env/server';
import { isAuthorizedScheduledRequest, isAuthorizedWorkerRequest } from '@/lib/security/workerAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const path = '/api/internal/outbox/process';

function unavailable(requestId: string, status = 404, code = 'worker_unavailable') {
  return NextResponse.json(
    { ok: false, requestId, error: { code, retryable: status === 503 } },
    {
      status,
      headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
    },
  );
}

async function process(request: Request, scheduled: boolean) {
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
            'nagarik-worker/outbox-process/v1',
          ),
        );
    if (!authorized) return unavailable(requestId);
    if (!scheduled) await requireWorkerCommand(request, 'outbox-process-v1');
    if (env.NAGARIK_CAP_V2_WRITES !== 'true') return unavailable(requestId, 503);

    const query = databaseExecutor();
    const enabled = await query.query(
      `select nagarik.is_capability_enabled('v2WritesEnabled') as enabled`,
    );
    if (enabled[0]?.enabled !== true) return unavailable(requestId, 503);
    const signer = await createConfiguredChainSigner(env);
    const result = await processChainOutboxBatch(
      {
        query,
        transaction: runDatabaseTransaction,
        signer,
        workerId: `outbox:${env.NEXT_PUBLIC_RELEASE_ID ?? 'local'}`,
      },
      10,
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
  return process(request, true);
}

export async function POST(request: Request) {
  return process(request, false);
}
