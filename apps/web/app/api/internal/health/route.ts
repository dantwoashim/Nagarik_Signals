import { NextResponse } from 'next/server';

import { getServerEnvironment } from '@/lib/env/server';
import { sendConfiguredOperationalAlert } from '@/lib/ops/alertRuntime';
import { readInternalHealth, type InternalHealthSnapshot } from '@/lib/ops/health';
import {
  createOperationalContext,
  emitOperationalEvent,
  type OperationalContext,
} from '@/lib/ops/telemetry';
import { isAuthorizedScheduledRequest } from '@/lib/security/workerAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const path = '/api/internal/health';

function safeReleaseId(value: string | undefined): string | null {
  return value && /^[0-9a-f]{40}$/.test(value) ? value : null;
}

function readinessMetrics(snapshot: InternalHealthSnapshot) {
  return {
    ready: Number(snapshot.ready),
    environment: Number(snapshot.checks.environment),
    database: Number(snapshot.checks.database),
    featureSwitches: Number(snapshot.checks.featureSwitches),
    deadLettersHealthy: Number(snapshot.checks.deadLetters),
    outboxPending: snapshot.outbox.pending,
    outboxLeased: snapshot.outbox.leased,
    outboxSubmittedUnknown: snapshot.outbox.submittedUnknown,
    outboxConfirming: snapshot.outbox.confirming,
    outboxBlocked: snapshot.outbox.blocked,
    outboxDeadLetter: snapshot.outbox.deadLetter,
  };
}

async function deliverReadinessAlert(
  context: OperationalContext,
  env: ReturnType<typeof getServerEnvironment>,
  metrics: ReturnType<typeof readinessMetrics>,
) {
  await sendConfiguredOperationalAlert({
    context,
    environment: env,
    kind: 'readiness_failed',
    severity: 'critical',
    metrics,
  });
}

export async function GET(request: Request) {
  const context = createOperationalContext();
  const headers = { 'Cache-Control': 'no-store', 'X-Request-Id': context.requestId };

  try {
    const env = getServerEnvironment();
    if (!env.CRON_SECRET || !isAuthorizedScheduledRequest(request, env.CRON_SECRET, path)) {
      emitOperationalEvent({
        event: 'health.readiness',
        outcome: 'denied',
        ...context,
        releaseId: env.NEXT_PUBLIC_RELEASE_ID,
        environment: env.NODE_ENV,
        durationMs: Math.max(Date.now() - context.startedAtMs, 0),
        metrics: { httpStatus: 404 },
        dimensions: { trigger: 'cron' },
      });
      return NextResponse.json(
        {
          ok: false,
          requestId: context.requestId,
          error: { code: 'worker_unavailable', retryable: false },
        },
        { status: 404, headers },
      );
    }

    const snapshot = await readInternalHealth();
    const metrics = readinessMetrics(snapshot);
    emitOperationalEvent({
      event: 'health.readiness',
      outcome: snapshot.ready ? 'success' : 'degraded',
      ...context,
      releaseId: env.NEXT_PUBLIC_RELEASE_ID,
      environment: env.NODE_ENV,
      durationMs: Math.max(Date.now() - context.startedAtMs, 0),
      metrics: { ...metrics, httpStatus: snapshot.ready ? 200 : 503 },
      dimensions: { trigger: 'cron' },
    });
    if (!snapshot.ready) await deliverReadinessAlert(context, env, metrics);
    return NextResponse.json(
      {
        ok: snapshot.ready,
        requestId: context.requestId,
        data: { status: snapshot.ready ? 'ready' : 'not_ready' },
      },
      { status: snapshot.ready ? 200 : 503, headers },
    );
  } catch {
    emitOperationalEvent({
      event: 'health.readiness',
      outcome: 'failure',
      ...context,
      releaseId: safeReleaseId(process.env.NEXT_PUBLIC_RELEASE_ID),
      environment:
        process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test'
          ? process.env.NODE_ENV
          : 'development',
      durationMs: Math.max(Date.now() - context.startedAtMs, 0),
      metrics: { httpStatus: 503 },
      dimensions: { trigger: 'cron' },
    });
    return NextResponse.json(
      {
        ok: false,
        requestId: context.requestId,
        error: { code: 'worker_unavailable', retryable: true },
      },
      { status: 503, headers },
    );
  }
}
