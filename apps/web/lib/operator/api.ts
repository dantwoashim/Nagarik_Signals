export class OperatorApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'OperatorApiError';
  }
}

export async function readOperatorApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    data?: T;
    error?: { code?: string; retryable?: boolean };
  } | null;
  if (!response.ok || !payload?.ok || payload.data === undefined) {
    throw new OperatorApiError(
      payload?.error?.code ?? 'operator_service_unavailable',
      response.status,
      payload?.error?.retryable === true,
    );
  }
  return payload.data;
}
