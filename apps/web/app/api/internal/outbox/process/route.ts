import { NextResponse } from 'next/server';

import { requireWorkerCommand, WorkerRequestError } from '@/lib/api/workerRequest';
import { createConfiguredChainSigner } from '@/lib/chain/configuredSigner';
import { processChainOutboxBatch } from '@/lib/chain/outboxWorker';
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
  const context = createOperationalContext();
  const trigger = scheduled ? 'cron' : 'manual';
  let environment: ReturnType<typeof getServerEnvironment> | undefined;
  const record = (
    outcome: OperationalOutcome,
    httpStatus: number,
    metrics: Record<string, number> = {},
  ) =>
    emitOperationalEvent({
      event: 'worker.outbox',
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
            'nagarik-worker/outbox-process/v1',
          ),
        );
    if (!authorized) {
      record('denied', 404);
      return unavailable(context.requestId);
    }
    if (!scheduled) await requireWorkerCommand(request, 'outbox-process-v1');
    if (env.NAGARIK_CAP_V2_WRITES !== 'true') {
      record('degraded', 503);
      return unavailable(context.requestId, 503);
    }

    const query = databaseExecutor();
    const enabled = await query.query(
      `select nagarik.is_capability_enabled('v2WritesEnabled') as enabled`,
    );
    if (enabled[0]?.enabled !== true) {
      record('degraded', 503);
      return unavailable(context.requestId, 503);
    }
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
    record(
      result.deadLetter > 0 || result.submittedUnknown > 0 ? 'degraded' : 'success',
      200,
      result,
    );
    if (result.deadLetter > 0) {
      await sendConfiguredOperationalAlert({
        context,
        environment: env,
        kind: 'outbox_dead_letter',
        severity: 'critical',
        metrics: {
          claimed: result.claimed,
          retry: result.retry,
          deadLetter: result.deadLetter,
        },
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
  return process(request, true);
}

export async function POST(request: Request) {
  return process(request, false);
}
