import type { ServerEnvironment } from '../env/schema';
import { createOperationalAlert, deliverOperationalAlert } from './alerts';
import {
  emitOperationalEvent,
  type OperationalAlertKind,
  type OperationalContext,
} from './telemetry';

type AlertEnvironment = Pick<
  ServerEnvironment,
  | 'NAGARIK_ALERT_WEBHOOK_TOKEN'
  | 'NAGARIK_ALERT_WEBHOOK_URL'
  | 'NEXT_PUBLIC_RELEASE_ID'
  | 'NODE_ENV'
>;

export async function sendConfiguredOperationalAlert(
  input: {
    context: OperationalContext;
    environment: AlertEnvironment;
    kind: OperationalAlertKind;
    severity: 'critical' | 'warning';
    metrics: Record<string, number>;
  },
  options: {
    fetcher?: typeof fetch;
    sink?: (record: string) => void;
    now?: () => Date;
    clock?: () => number;
  } = {},
): Promise<'delivered' | 'failed' | 'not_configured'> {
  const clock = options.clock ?? Date.now;
  const startedAt = clock();
  const record = (outcome: 'degraded' | 'failure' | 'success', httpStatus: number) => {
    emitOperationalEvent(
      {
        event: 'alert.delivery',
        outcome,
        ...input.context,
        releaseId: input.environment.NEXT_PUBLIC_RELEASE_ID,
        environment: input.environment.NODE_ENV,
        durationMs: Math.max(clock() - startedAt, 0),
        metrics: { httpStatus },
        dimensions: { alertKind: input.kind },
      },
      { now: options.now?.(), sink: options.sink },
    );
  };

  const url = input.environment.NAGARIK_ALERT_WEBHOOK_URL;
  const token = input.environment.NAGARIK_ALERT_WEBHOOK_TOKEN;
  const releaseId = input.environment.NEXT_PUBLIC_RELEASE_ID;
  if (!url || !token || !releaseId) {
    record('degraded', 0);
    return 'not_configured';
  }

  try {
    const alert = createOperationalAlert({
      kind: input.kind,
      severity: input.severity,
      occurredAt: (options.now?.() ?? new Date()).toISOString(),
      requestId: input.context.requestId,
      traceId: input.context.traceId,
      releaseId,
      metrics: input.metrics,
    });
    const result = await deliverOperationalAlert(alert, {
      url,
      token,
      fetcher: options.fetcher,
    });
    record('success', result.httpStatus);
    return 'delivered';
  } catch {
    record('failure', 0);
    return 'failed';
  }
}
