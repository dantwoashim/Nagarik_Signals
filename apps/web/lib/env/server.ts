import 'server-only';

import { formatEnvironmentError, parseServerEnvironment, type ServerEnvironment } from './schema';

let cached: ServerEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
  if (cached) return cached;
  try {
    cached = parseServerEnvironment(process.env);
    return cached;
  } catch (error) {
    const detail =
      error instanceof Error && 'issues' in error
        ? formatEnvironmentError(error as Parameters<typeof formatEnvironmentError>[0])
        : 'invalid environment';
    throw new Error(`nagarik_environment_invalid: ${detail}`, { cause: error });
  }
}

export function resetServerEnvironmentForTests(): void {
  cached = undefined;
}
