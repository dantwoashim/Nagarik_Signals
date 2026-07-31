import { createHash } from 'node:crypto';

import { safeAlertWebhookUrl } from './alertEndpoint';
import type { OperationalAlertKind } from './telemetry';

const alertMetrics: Record<OperationalAlertKind, readonly string[]> = {
  outbox_dead_letter: ['claimed', 'retry', 'deadLetter'],
  readiness_failed: [
    'ready',
    'environment',
    'database',
    'featureSwitches',
    'deadLettersHealthy',
    'outboxPending',
    'outboxLeased',
    'outboxSubmittedUnknown',
    'outboxConfirming',
    'outboxBlocked',
    'outboxDeadLetter',
  ],
  reconciliation_conflict: ['inspected', 'missing', 'conflict', 'invalid', 'rpcErrors'],
  retention_failure: ['inspected', 'deleted', 'failed', 'skipped'],
  worker_failed: ['httpStatus'],
};

const requestIdPattern =
  /^req_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const traceIdPattern = /^trc_[0-9a-f]{32}$/;
const releaseIdPattern = /^[0-9a-f]{40}$/;

export type OperationalAlert = {
  schemaVersion: 'nagarik-operational-alert-v1';
  alertId: string;
  kind: OperationalAlertKind;
  severity: 'critical' | 'warning';
  occurredAt: string;
  requestId: string;
  traceId: string;
  releaseId: string;
  metrics: Record<string, number>;
};

export class AlertDeliveryError extends Error {
  constructor(public readonly code: 'alert_configuration_invalid' | 'alert_delivery_failed') {
    super(code);
    this.name = 'AlertDeliveryError';
  }
}

export function createOperationalAlert(
  input: Omit<OperationalAlert, 'alertId' | 'schemaVersion'>,
): OperationalAlert {
  const metricNames = alertMetrics[input.kind];
  const occurredAt = new Date(input.occurredAt);
  const allowedMetrics = new Set(metricNames ?? []);
  if (
    !metricNames ||
    (input.severity !== 'critical' && input.severity !== 'warning') ||
    !requestIdPattern.test(input.requestId) ||
    !traceIdPattern.test(input.traceId) ||
    !releaseIdPattern.test(input.releaseId) ||
    !Number.isFinite(occurredAt.getTime()) ||
    occurredAt.toISOString() !== input.occurredAt ||
    !Object.entries(input.metrics).every(
      ([name, value]) => allowedMetrics.has(name) && Number.isFinite(value) && value >= 0,
    )
  ) {
    throw new AlertDeliveryError('alert_configuration_invalid');
  }
  const identity = [input.releaseId, input.kind, input.requestId, input.occurredAt].join(':');
  return {
    schemaVersion: 'nagarik-operational-alert-v1',
    alertId: `alt_${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`,
    kind: input.kind,
    severity: input.severity,
    occurredAt: input.occurredAt,
    requestId: input.requestId,
    traceId: input.traceId,
    releaseId: input.releaseId,
    metrics: { ...input.metrics },
  };
}

export async function deliverOperationalAlert(
  alert: OperationalAlert,
  configuration: {
    url: string;
    token: string;
    fetcher?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<{ alertId: string; status: 'delivered'; httpStatus: number }> {
  let payload: OperationalAlert;
  try {
    payload = createOperationalAlert({
      kind: alert.kind,
      severity: alert.severity,
      occurredAt: alert.occurredAt,
      requestId: alert.requestId,
      traceId: alert.traceId,
      releaseId: alert.releaseId,
      metrics: alert.metrics,
    });
  } catch {
    throw new AlertDeliveryError('alert_configuration_invalid');
  }
  if (payload.alertId !== alert.alertId) {
    throw new AlertDeliveryError('alert_configuration_invalid');
  }
  const url = safeAlertWebhookUrl(configuration.url);
  const timeoutMs = configuration.timeoutMs ?? 3_000;
  if (
    !url ||
    Buffer.byteLength(configuration.token, 'utf8') < 32 ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 10_000
  ) {
    throw new AlertDeliveryError('alert_configuration_invalid');
  }

  let response: Response;
  try {
    response = await (configuration.fetcher ?? fetch)(url, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        authorization: `Bearer ${configuration.token}`,
        'content-type': 'application/json',
        'x-nagarik-alert-id': alert.alertId,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AlertDeliveryError('alert_delivery_failed');
  }
  if (!response.ok) throw new AlertDeliveryError('alert_delivery_failed');
  return { alertId: payload.alertId, status: 'delivered', httpStatus: response.status };
}
