import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { getServerEnvironment } from '@/lib/env/server';
import { readInternalHealth } from '@/lib/ops/health';
import { isAuthorizedScheduledRequest } from '@/lib/security/workerAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const path = '/api/internal/health';

export async function GET(request: Request) {
  const requestId = `req_${randomUUID()}`;
  const headers = { 'Cache-Control': 'no-store', 'X-Request-Id': requestId };

  try {
    const env = getServerEnvironment();
    if (!env.CRON_SECRET || !isAuthorizedScheduledRequest(request, env.CRON_SECRET, path)) {
      return NextResponse.json(
        {
          ok: false,
          requestId,
          error: { code: 'worker_unavailable', retryable: false },
        },
        { status: 404, headers },
      );
    }

    const snapshot = await readInternalHealth();
    return NextResponse.json(
      { ok: snapshot.ready, requestId, data: { status: snapshot.ready ? 'ready' : 'not_ready' } },
      { status: snapshot.ready ? 200 : 503, headers },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        requestId,
        error: { code: 'worker_unavailable', retryable: true },
      },
      { status: 503, headers },
    );
  }
}
