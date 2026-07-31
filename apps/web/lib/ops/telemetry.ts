import { randomUUID } from 'node:crypto';

const eventMetrics = {
  'alert.delivery': ['httpStatus'],
  'health.readiness': [
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
    'httpStatus',
  ],
  'worker.outbox': [
    'claimed',
    'confirmed',
    'submittedUnknown',
    'retry',
    'deadLetter',
    'httpStatus',
  ],
  'worker.reconcile': [
    'inspected',
    'consistent',
    'recoverable',
    'repaired',
    'missing',
    'conflict',
    'invalid',
    'rpcErrors',
    'busy',
    'httpStatus',
  ],
  'worker.retention': ['inspected', 'deleted', 'failed', 'skipped', 'httpStatus'],
} as const;

const dimensionValues = {
  alertKind: [
    'outbox_dead_letter',
    'readiness_failed',
    'reconciliation_conflict',
    'retention_failure',
    'worker_failed',
  ],
  trigger: ['cron', 'manual'],
} as const;

export type OperationalEventName = keyof typeof eventMetrics;
export type OperationalOutcome = 'degraded' | 'denied' | 'failure' | 'success';
export type OperationalAlertKind = (typeof dimensionValues.alertKind)[number];
export type OperationalTrigger = (typeof dimensionValues.trigger)[number];

export type OperationalContext = {
  requestId: string;
  traceId: string;
  startedAtMs: number;
};

export type OperationalEventInput = {
  event: OperationalEventName;
  outcome: OperationalOutcome;
  requestId: string;
  traceId: string;
  releaseId?: string | null;
  environment?: 'development' | 'production' | 'test';
  durationMs: number;
  metrics?: Record<string, number>;
  dimensions?: {
    alertKind?: OperationalAlertKind;
    trigger?: OperationalTrigger;
  };
};

export type OperationalEvent = {
  schemaVersion: 'nagarik-operational-event-v1';
  occurredAt: string;
  severity: 'error' | 'info' | 'warning';
  event: OperationalEventName;
  outcome: OperationalOutcome;
  requestId: string;
  traceId: string;
  releaseId: string | null;
  environment: 'development' | 'production' | 'test';
  durationMs: number;
  metrics: Record<string, number>;
  dimensions: Record<string, string>;
};

const requestIdPattern =
  /^req_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const traceIdPattern = /^trc_[0-9a-f]{32}$/;
const releaseIdPattern = /^[0-9a-f]{40}$/;

function nonNegativeNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name}_invalid`);
  return value;
}

function normalizedMetrics(
  event: OperationalEventName,
  metrics: Record<string, number> | undefined,
): Record<string, number> {
  const allowed = new Set<string>(eventMetrics[event]);
  const result: Record<string, number> = {};
  for (const [name, value] of Object.entries(metrics ?? {})) {
    if (!allowed.has(name)) throw new Error('operational_metric_not_allowed');
    result[name] = nonNegativeNumber(value, 'operational_metric');
  }
  return result;
}

function normalizedDimensions(
  dimensions: OperationalEventInput['dimensions'],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(dimensions ?? {})) {
    if (!(name in dimensionValues)) throw new Error('operational_dimension_not_allowed');
    const allowed = dimensionValues[name as keyof typeof dimensionValues] as readonly string[];
    if (!allowed.includes(value)) throw new Error('operational_dimension_value_invalid');
    result[name] = value;
  }
  return result;
}

export function createOperationalContext(now = Date.now()): OperationalContext {
  return {
    requestId: `req_${randomUUID()}`,
    traceId: `trc_${randomUUID().replaceAll('-', '')}`,
    startedAtMs: now,
  };
}

export function createOperationalEvent(
  input: OperationalEventInput,
  now = new Date(),
): OperationalEvent {
  if (!(input.event in eventMetrics)) throw new Error('operational_event_not_allowed');
  if (!['degraded', 'denied', 'failure', 'success'].includes(input.outcome)) {
    throw new Error('operational_outcome_invalid');
  }
  if (
    input.environment !== undefined &&
    !['development', 'production', 'test'].includes(input.environment)
  ) {
    throw new Error('operational_environment_invalid');
  }
  if (!requestIdPattern.test(input.requestId)) throw new Error('operational_request_id_invalid');
  if (!traceIdPattern.test(input.traceId)) throw new Error('operational_trace_id_invalid');
  const releaseId = input.releaseId?.trim().toLowerCase() || null;
  if (releaseId && !releaseIdPattern.test(releaseId)) {
    throw new Error('operational_release_id_invalid');
  }
  if (!Number.isFinite(now.getTime())) throw new Error('operational_time_invalid');

  return {
    schemaVersion: 'nagarik-operational-event-v1',
    occurredAt: now.toISOString(),
    severity:
      input.outcome === 'failure' ? 'error' : input.outcome === 'success' ? 'info' : 'warning',
    event: input.event,
    outcome: input.outcome,
    requestId: input.requestId,
    traceId: input.traceId,
    releaseId,
    environment: input.environment ?? 'development',
    durationMs: nonNegativeNumber(input.durationMs, 'operational_duration'),
    metrics: normalizedMetrics(input.event, input.metrics),
    dimensions: normalizedDimensions(input.dimensions),
  };
}

export function emitOperationalEvent(
  input: OperationalEventInput,
  options: {
    now?: Date;
    sink?: (record: string) => void;
  } = {},
): OperationalEvent {
  const event = createOperationalEvent(input, options.now);
  const record = `${JSON.stringify(event)}\n`;
  (options.sink ?? ((value) => process.stdout.write(value)))(record);
  return event;
}
