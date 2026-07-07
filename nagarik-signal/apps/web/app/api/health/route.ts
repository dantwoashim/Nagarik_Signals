import { NextResponse } from 'next/server';
import { appConfig } from '@/lib/constants/config';
import { latestIndexedIssue, readModel, readModelExists } from '@/lib/db/queries';
import { getSupabaseConfig } from '@/lib/db/supabase';
import { chainHealth } from '@/lib/solana/actions';
import { readModelPath } from '@/lib/server/paths';

export const runtime = 'nodejs';

export async function GET() {
  let rpc: Awaited<ReturnType<typeof chainHealth>> | { ok: false; error: string };
  try {
    rpc = await chainHealth();
  } catch (error) {
    rpc = { ok: false, error: error instanceof Error ? error.message : 'rpc_health_failed' };
  }
  const model = readModel();
  const latest = latestIndexedIssue();
  const supabase = getSupabaseConfig();
  return NextResponse.json({
    ok: Boolean(rpc.ok),
    app: appConfig.name,
    cluster: appConfig.cluster,
    programId: appConfig.programId,
    rpc,
    db: {
      mode: 'local_json_read_model',
      ok: readModelExists(),
      path: readModelPath(),
      issueCount: model.issues.length,
      verificationCount: model.verifications.length,
      statusUpdateCount: model.statusUpdates.length,
      latestIndexedIssue: latest ? { issueId: latest.issueId, issuePda: latest.proof.issuePda, txSig: latest.proof.latestTxSig } : null,
      supabase: {
        configured: supabase.configured,
        urlConfigured: Boolean(supabase.url),
        anonKeyConfigured: Boolean(supabase.anonKey),
      },
    },
  });
}
