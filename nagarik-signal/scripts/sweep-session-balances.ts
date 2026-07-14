import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { Connection, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';

const root = resolve(process.cwd());
const sessionDirectory = resolve(root, 'data', 'session-keypairs');
const walletPath = process.env.ANCHOR_WALLET ?? resolve(homedir(), '.config', 'solana', 'id.json');
const rpcUrl = process.env.ANCHOR_PROVIDER_URL ?? 'https://api.devnet.solana.com';
const execute = process.argv.includes('--execute');

async function readKeypair(path: string) {
  const secret = JSON.parse(await readFile(path, 'utf8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const recipient = await readKeypair(walletPath);
  const connection = new Connection(rpcUrl, 'confirmed');
  const accountReserve = (await connection.getMinimumBalanceForRentExemption(0)) + 20_000;
  const files = (await readdir(sessionDirectory)).filter((file) => file.endsWith('.json')).sort();
  let recoverable = 0;
  const rows: Array<{ file: string; pubkey: string; balance: number; transfer: number; txSig: string | null }> = [];

  for (const file of files) {
    const keypair = await readKeypair(resolve(sessionDirectory, file));
    const balance = await connection.getBalance(keypair.publicKey, 'confirmed');
    const transfer = Math.max(0, balance - accountReserve);
    recoverable += transfer;
    let txSig: string | null = null;
    if (execute && transfer > 0) {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: recipient.publicKey,
          lamports: transfer,
        })
      );
      txSig = await sendAndConfirmTransaction(connection, transaction, [keypair], { commitment: 'confirmed' });
    }
    rows.push({ file, pubkey: keypair.publicKey.toBase58(), balance, transfer, txSig });
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: execute ? 'executed' : 'dry_run',
    rpcUrl,
    recipient: recipient.publicKey.toBase58(),
    sessionCount: rows.length,
    recoverableLamports: recoverable,
    recoverableSol: recoverable / 1_000_000_000,
    accountReserveLamports: accountReserve,
    rows,
  }, null, 2)}\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
