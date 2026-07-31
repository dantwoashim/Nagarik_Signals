import { NextResponse } from 'next/server';

import { requireWorkerCommand, WorkerRequestError } from '@/lib/api/workerRequest';
import { databaseExecutor, runDatabaseTransaction } from '@/lib/db/transaction';
import { getServerEnvironment } from '@/lib/env/server';
import { sendConfiguredOperationalAlert } from '@/lib/ops/alertRuntime';
import {
  createOperationalContext,
  emitOperationalEvent,
  type OperationalOutcome,
} from '@/lib/ops/telemetry';
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
  const context = createOperationalContext();
  const trigger = scheduled ? 'cron' : 'manual';
  let environment: ReturnType<typeof getServerEnvironment> | undefined;
  const record = (
    outcome: OperationalOutcome,
    httpStatus: number,
    metrics: Record<string, number> = {},
  ) =>
    emitOperationalEvent({
      event: 'worker.retention',
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
            'nagarik-worker/retention/v1',
          ),
        );
    if (!authorized) {
      record('denied', 404);
      return unavailable(context.requestId);
    }
    if (!scheduled) await requireWorkerCommand(request, 'retention-worker-v1');
    if (!env.NAGARIK_SECURITY_CORRELATION_KEY) {
      record('degraded', 503);
      return unavailable(context.requestId, 503);
    }

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
    record(result.failed > 0 ? 'degraded' : 'success', 200, result);
    if (result.failed > 0) {
      await sendConfiguredOperationalAlert({
        context,
        environment: env,
        kind: 'retention_failure',
        severity: 'critical',
        metrics: result,
      });
    }
    return NextResponse.json(
      { ok: true, requestId: context.requestId, data: result },
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
  return retain(request, true);
}

export async function POST(request: Request) {
  return retain(request, false);
}
