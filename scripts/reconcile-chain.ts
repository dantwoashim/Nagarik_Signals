import { reconcileChainOutbox } from '../apps/web/lib/chain/reconciler';
import { withChainWorkerRuntime } from './lib/chainWorkerRuntime';

function argumentsFromCommandLine(): { dryRun: boolean; limit: number } {
  let dryRun = true;
  let limit = 25;
  for (const argument of process.argv.slice(2)) {
    if (argument === '--apply') dryRun = false;
    else if (argument.startsWith('--limit=')) {
      limit = Number(argument.slice('--limit='.length));
    } else {
      throw new Error(`unknown_argument:${argument}`);
    }
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('limit_must_be_between_1_and_100');
  }
  return { dryRun, limit };
}

async function main() {
  const options = argumentsFromCommandLine();
  if (!options.dryRun && process.env.NAGARIK_CAP_V2_WRITES !== 'true') {
    throw new Error('NAGARIK_CAP_V2_WRITES_must_be_true_for_apply');
  }
  const result = await withChainWorkerRuntime(async (runtime) => {
    if (!options.dryRun) {
      const enabled = await runtime.query.query(
        `select nagarik.is_capability_enabled('v2WritesEnabled') as enabled`,
      );
      if (enabled[0]?.enabled !== true) throw new Error('v2_writes_kill_switch_disabled');
    }
    return reconcileChainOutbox(
      {
        ...runtime,
        workerId: `reconcile-cli:${process.pid}`,
      },
      options,
    );
  });
  console.log(JSON.stringify({ ok: true, result }, null, 2));
  if (result.conflict > 0 || result.invalid > 0 || result.rpcErrors > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'chain_reconciliation_failed');
  process.exitCode = 1;
});
