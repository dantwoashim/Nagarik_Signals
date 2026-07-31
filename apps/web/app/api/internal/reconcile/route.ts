import { NextResponse } from 'next/server';

import { requireWorkerCommand, WorkerRequestError } from '@/lib/api/workerRequest';
import { createConfiguredChainSigner } from '@/lib/chain/configuredSigner';
import { reconcileChainOutbox } from '@/lib/chain/reconciler';
import { databaseExecutor, runDatabaseTransaction } from '@/lib/db/transaction';
import { getServerEnvironment } from '@/lib/env/server';
import { sendConfiguredOperationalAlert } from '@/lib/ops/alertRuntime';
import {
  createOperationalContext,
  emitOperationalEvent,
  type OperationalOutcome,
} from '@/lib/ops/telemetry';
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
  const context = createOperationalContext();
  const trigger = scheduled ? 'cron' : 'manual';
  let environment: ReturnType<typeof getServerEnvironment> | undefined;
  const record = (
    outcome: OperationalOutcome,
    httpStatus: number,
    metrics: Record<string, number> = {},
  ) =>
    emitOperationalEvent({
      event: 'worker.reconcile',
      outcome,
      ...context,
      releaseId: environment?.NEXT_PUBLIC_RELEASE_ID,
      environment: environment?.NODE_ENV,
      durationMs: Math.max(Date.now() - context.startedAtMs, 0),
      metrics: { ...metrics, httpStatus },
      dimensions: { trigger },
    });
  try {
    const env = getServerEnvironment();
    environment = env;
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
    if (!authorized) {
      record('denied', 404);
      return unavailable(context.requestId);
    }
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
    const metrics = {
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
    const alertable = result.conflict > 0 || result.invalid > 0 || result.rpcErrors > 0;
    record(alertable || result.recoverable > 0 ? 'degraded' : 'success', 200, metrics);
    if (alertable) {
      await sendConfiguredOperationalAlert({
        context,
        environment: env,
        kind: 'reconciliation_conflict',
        severity: result.conflict > 0 || result.invalid > 0 ? 'critical' : 'warning',
        metrics: {
          inspected: result.inspected,
          missing: result.missing,
          conflict: result.conflict,
          invalid: result.invalid,
          rpcErrors: result.rpcErrors,
        },
      });
    }
    return NextResponse.json(
      { ok: true, requestId: context.requestId, data: summary },
      {
        headers: { 'Cache-Control': 'no-store', 'X-Request-Id': context.requestId },
      },
    );
  } catch (error) {
    if (error instanceof WorkerRequestError) {
      record('denied', 400);
      return unavailable(context.requestId, 400, error.message);
    }
    record('failure', 503);
    if (environment) {
      await sendConfiguredOperationalAlert({
        context,
        environment,
        kind: 'worker_failed',
        severity: 'critical',
        metrics: { httpStatus: 503 },
      });
    }
    return unavailable(context.requestId, 503);
  }
}

export async function GET(request: Request) {
  return reconcile(request, true);
}

export async function POST(request: Request) {
  return reconcile(request, false);
}
