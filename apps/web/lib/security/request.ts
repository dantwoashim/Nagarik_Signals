import 'server-only';

import { createHash } from 'node:crypto';

export class RequestSecurityError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

function allowedOrigins() {
  return new Set(
    [
      process.env.NEXT_PUBLIC_APP_URL,
      ...(process.env.NAGARIK_ALLOWED_ORIGINS ?? '').split(','),
      process.env.NODE_ENV !== 'production' ? 'http://localhost:3001' : null,
      process.env.NODE_ENV !== 'production' ? 'http://127.0.0.1:3001' : null,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => {
        try {
          return new URL(value.trim()).origin;
        } catch {
          throw new Error(`invalid_allowed_origin:${value}`);
        }
      })
  );
}

export function assertTrustedMutation(request: Request, options: { maxBytes?: number } = {}) {
  const origin = request.headers.get('origin');
  const allowed = allowedOrigins();
  if (origin) {
    let requestOrigin: string;
    try {
      requestOrigin = new URL(origin).origin;
    } catch {
      throw new RequestSecurityError('invalid_origin', 403);
    }
    if (!allowed.has(requestOrigin)) throw new RequestSecurityError('untrusted_origin', 403);
  }
  if (!origin && process.env.NODE_ENV === 'production') {
    throw new RequestSecurityError('origin_required', 403);
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (options.maxBytes && contentLength > options.maxBytes) {
    throw new RequestSecurityError('request_too_large', 413);
  }
}

export function requestIpHash(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const value = forwarded || request.headers.get('x-real-ip') || 'unknown';
  const pepper = process.env.NAGARIK_RATE_LIMIT_PEPPER ?? process.env.NAGARIK_COOKIE_SECRET ?? 'local-rate-limit';
  return createHash('sha256').update(`${pepper}:${value}`).digest('hex');
}

export function securityErrorResponse(error: unknown) {
  if (error instanceof RequestSecurityError) return { code: error.code, status: error.status };
  return null;
}
