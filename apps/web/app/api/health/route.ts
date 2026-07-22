import { NextResponse } from 'next/server';
import { appConfig } from '@/lib/constants/config';
import { latestIndexedIssue, readModel, readModelExists, readModelStorageMode } from '@/lib/db/queries';
import { getSupabaseConfig } from '@/lib/db/supabase';
import { chainHealth } from '@/lib/solana/actions';
import { readModelPath } from '@/lib/server/paths';
import { publicPreviewReadOnly } from '@/lib/deployment';
import { configuredStorageMode } from '@/lib/storage/mediaConfig';
import { deploymentRelease, runtimeReadiness } from '@/lib/ops/readiness';

export const runtime = 'nodejs';

export async function GET() {
  let rpc: Awaited<ReturnType<typeof chainHealth>> | { ok: false; error: string };
  try {
    rpc = await chainHealth({ includeRelayer: !publicPreviewReadOnly });
  } catch (error) {
    rpc = { ok: false, error: error instanceof Error ? error.message : 'rpc_health_failed' };
  }
  const [model, latest, modelExists] = await Promise.all([readModel(), latestIndexedIssue(), readModelExists()]);
  const supabase = getSupabaseConfig();
  const readModelMode = readModelStorageMode();
  let mediaStorageMode: 'local' | 'blob' | null = null;
  try {
    mediaStorageMode = configuredStorageMode();
  } catch {
    mediaStorageMode = null;
  }
  const rpcRecord = rpc as Record<string, unknown>;
  const readiness = runtimeReadiness({
    env: process.env,
    publicPreviewReadOnly,
    readModelMode,
    mediaStorageMode,
    modelExists,
    rpcOk: rpc.ok,
    programDeployed: rpcRecord.programDeployed === true,
    relayerAvailable: typeof rpcRecord.relayerPubkey === 'string' && rpcRecord.relayerPubkey.length > 0,
  });
  return NextResponse.json({
    ok: Boolean(rpc.ok),
    app: appConfig.name,
    generatedAt: new Date().toISOString(),
    release: deploymentRelease(process.env),
    readiness,
    cluster: appConfig.cluster,
    programId: appConfig.programId,
    rpc,
    db: {
      mode: readModelMode,
      ok: modelExists,
      path: readModelMode === 'local_json' ? readModelPath() : null,
      issueCount: model.issues.length,
      verificationCount: model.verifications.length,
      statusUpdateCount: model.statusUpdates.length,
      authorityHandoffCount: model.authorityHandoffs.length,
      latestIndexedIssue: latest ? { issueId: latest.issueId, issuePda: latest.proof.issuePda, txSig: latest.proof.latestTxSig } : null,
      supabase: {
        configured: supabase.configured,
        urlConfigured: Boolean(supabase.url),
        anonKeyConfigured: Boolean(supabase.anonKey),
      },
    },
  }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}
