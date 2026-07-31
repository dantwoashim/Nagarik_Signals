import { readJsonLimited, RequestBodyError } from './requestBody';

export type WorkerCommandSchema =
  'outbox-process-v1' | 'reconcile-worker-v1' | 'retention-worker-v1';

export class WorkerRequestError extends Error {
  constructor() {
    super('worker_request_invalid');
    this.name = 'WorkerRequestError';
  }
}

function exactCommand(value: unknown, schemaVersion: WorkerCommandSchema): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return Object.keys(source).length === 1 && source.schemaVersion === schemaVersion;
}

export async function requireWorkerCommand(
  request: Request,
  schemaVersion: WorkerCommandSchema,
): Promise<void> {
  if (request.method !== 'POST' || new URL(request.url).search !== '') {
    throw new WorkerRequestError();
  }

  try {
    const body = await readJsonLimited<unknown>(request, 1_024);
    if (!exactCommand(body, schemaVersion)) throw new WorkerRequestError();
  } catch (error) {
    if (error instanceof WorkerRequestError) throw error;
    if (error instanceof RequestBodyError) throw new WorkerRequestError();
    throw error;
  }
}
