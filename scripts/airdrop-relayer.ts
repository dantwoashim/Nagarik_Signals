import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getConnection, loadKeypair, parseArgs } from './lib/nagarikClient';

async function main() {
  const options = parseArgs();
  const keypair = loadKeypair(options.keypair);
  const amount = Number(options.sol ?? 2);
  const connection = getConnection();
  const signature = await connection.requestAirdrop(
    keypair.publicKey,
    amount * LAMPORTS_PER_SOL
  );
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
  const balance = await connection.getBalance(keypair.publicKey);

  console.log(JSON.stringify({
    ok: true,
    action: 'airdrop_devnet_sol',
    wallet: keypair.publicKey.toBase58(),
    signature,
    balanceSol: balance / LAMPORTS_PER_SOL,
    boundary: 'Devnet only. Never use production funds for the MVP relayer.',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
