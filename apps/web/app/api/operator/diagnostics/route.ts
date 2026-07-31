import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { operatorWorkflowFailure } from '@/lib/api/operatorWorkflow';
import { requireOperator } from '@/lib/auth/operator';
import { readInternalHealth } from '@/lib/ops/health';
import { deploymentRelease } from '@/lib/ops/readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const requestId = `req_${randomUUID()}`;
  try {
    await requireOperator({ organizationId: null, roles: ['system_admin'] });
    const snapshot = await readInternalHealth();
    return NextResponse.json(
      {
        ok: true,
        requestId,
        data: {
          ...snapshot,
          release: deploymentRelease(process.env),
          checkedAt: new Date().toISOString(),
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = operatorWorkflowFailure(requestId, error);
    if (mapped) return mapped;
    return NextResponse.json(
      { ok: false, requestId, error: { code: 'diagnostics_unavailable', retryable: true } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
