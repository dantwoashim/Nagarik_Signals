import { NextResponse } from 'next/server';

import { getServerEnvironment } from '@/lib/env/server';
import { createOperationalAlert, deliverOperationalAlert } from '@/lib/ops/alerts';
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
  const startedAt = Date.now();
  const alertKind = 'readiness_failed';
  if (
    !env.NAGARIK_ALERT_WEBHOOK_URL ||
    !env.NAGARIK_ALERT_WEBHOOK_TOKEN ||
    !env.NEXT_PUBLIC_RELEASE_ID
  ) {
    emitOperationalEvent({
      event: 'alert.delivery',
      outcome: 'degraded',
      ...context,
      releaseId: env.NEXT_PUBLIC_RELEASE_ID,
      environment: env.NODE_ENV,
      durationMs: Date.now() - startedAt,
      metrics: { httpStatus: 0 },
      dimensions: { alertKind },
    });
    return;
  }

  const alert = createOperationalAlert({
    kind: alertKind,
    severity: 'critical',
    occurredAt: new Date().toISOString(),
    requestId: context.requestId,
    traceId: context.traceId,
    releaseId: env.NEXT_PUBLIC_RELEASE_ID,
    metrics,
  });
  try {
    const result = await deliverOperationalAlert(alert, {
      url: env.NAGARIK_ALERT_WEBHOOK_URL,
      token: env.NAGARIK_ALERT_WEBHOOK_TOKEN,
    });
    emitOperationalEvent({
      event: 'alert.delivery',
      outcome: 'success',
      ...context,
      releaseId: env.NEXT_PUBLIC_RELEASE_ID,
      environment: env.NODE_ENV,
      durationMs: Date.now() - startedAt,
      metrics: { httpStatus: result.httpStatus },
      dimensions: { alertKind },
    });
  } catch {
    emitOperationalEvent({
      event: 'alert.delivery',
      outcome: 'failure',
      ...context,
      releaseId: env.NEXT_PUBLIC_RELEASE_ID,
      environment: env.NODE_ENV,
      durationMs: Date.now() - startedAt,
      metrics: { httpStatus: 0 },
      dimensions: { alertKind },
    });
  }
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
        durationMs: Date.now() - context.startedAtMs,
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
      durationMs: Date.now() - context.startedAtMs,
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
      durationMs: Date.now() - context.startedAtMs,
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
