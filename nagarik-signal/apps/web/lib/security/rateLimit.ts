import 'server-only';

import { consumeRateLimit, type RequestEventMetadata } from '../db/queries';

export class RateLimitExceededError extends Error {
  constructor(public retryAfterSeconds: number) {
    super('rate_limit_exceeded');
  }
}

export async function assertRateLimit(input: {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
  metadata?: RequestEventMetadata;
}) {
  const decision = await consumeRateLimit(input);
  if (!decision.allowed) throw new RateLimitExceededError(decision.retryAfterSeconds);
  return decision;
}

export function rateLimitResponse(error: unknown) {
  return error instanceof RateLimitExceededError
    ? { code: error.message, status: 429, retryAfterSeconds: error.retryAfterSeconds }
    : null;
}
