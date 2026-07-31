import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { requireWorkerCommand, WorkerRequestError } from '@/lib/api/workerRequest';
import { createConfiguredChainSigner } from '@/lib/chain/configuredSigner';
import { reconcileChainOutbox } from '@/lib/chain/reconciler';
import { databaseExecutor, runDatabaseTransaction } from '@/lib/db/transaction';
import { getServerEnvironment } from '@/lib/env/server';
import { isAuthorizedScheduledRequest, isAuthorizedWorkerRequest } from '@/lib/security/workerAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const path = '/api/internal/reconcile';

function unavailable(requestId: string, status = 404, code = 'worker_unavailable') {
  return NextResponse.json(
    { ok: false, requestId, error: { code, retryable: status === 503 } },
    {
      status,
      headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
    },
  );
}

async function reconcile(request: Request, scheduled: boolean) {
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
            'nagarik-worker/reconcile/v1',
          ),
        );
    if (!authorized) return unavailable(requestId);
    if (!scheduled) await requireWorkerCommand(request, 'reconcile-worker-v1');

    const query = databaseExecutor();
    const signer = await createConfiguredChainSigner(env);
    const result = await reconcileChainOutbox(
      {
        query,
        transaction: runDatabaseTransaction,
        signer,
        workerId: `reconcile:${env.NEXT_PUBLIC_RELEASE_ID ?? 'local'}`,
      },
      {
        dryRun: true,
        limit: 25,
      },
    );
    const summary = {
      dryRun: result.dryRun,
      inspected: result.inspected,
      consistent: result.consistent,
      recoverable: result.recoverable,
      repaired: result.repaired,
      missing: result.missing,
      conflict: result.conflict,
      invalid: result.invalid,
      rpcErrors: result.rpcErrors,
      busy: result.busy,
    };
    return NextResponse.json(
      { ok: true, requestId, data: summary },
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
  return reconcile(request, true);
}

export async function POST(request: Request) {
  return reconcile(request, false);
}
