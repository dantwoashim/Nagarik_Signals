import { PublicKey } from '@solana/web3.js';
import {
  ensureRegistry,
  ensureSteward,
  getProgram,
  parseArgs,
} from './lib/nagarikClient';

async function main() {
  const options = parseArgs();
  const program = getProgram();
  await ensureRegistry(program);
  const wallet = typeof options.wallet === 'string'
    ? new PublicKey(options.wallet)
    : program.provider.publicKey;
  const stewardState = await ensureSteward(program, wallet);

  console.log(JSON.stringify({
    ok: true,
    action: 'add_steward',
    stewardCreated: stewardState.created,
    steward: stewardState.steward.toBase58(),
    wallet: wallet.toBase58(),
    txSig: stewardState.txSig,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
