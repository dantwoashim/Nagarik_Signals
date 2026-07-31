import { processChainOutboxBatch } from '../apps/web/lib/chain/outboxWorker';
import { withChainWorkerRuntime } from './lib/chainWorkerRuntime';

function limit(): number {
  const argument = process.argv.slice(2).find((value) => value.startsWith('--limit='));
  if (!argument) return 10;
  const parsed = Number(argument.slice('--limit='.length));
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 25) {
    throw new Error('limit_must_be_between_1_and_25');
  }
  return parsed;
}

async function main() {
  if (process.env.NAGARIK_CAP_V2_WRITES !== 'true') {
    throw new Error('NAGARIK_CAP_V2_WRITES_must_be_true');
  }
  const result = await withChainWorkerRuntime(async (runtime) => {
    const enabled = await runtime.query.query(
      `select nagarik.is_capability_enabled('v2WritesEnabled') as enabled`,
    );
    if (enabled[0]?.enabled !== true) throw new Error('v2_writes_kill_switch_disabled');
    return processChainOutboxBatch(
      {
        ...runtime,
        workerId: `cli:${process.pid}`,
      },
      limit(),
    );
  });
  console.log(JSON.stringify({ ok: true, result }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'outbox_processing_failed');
  process.exitCode = 1;
});
