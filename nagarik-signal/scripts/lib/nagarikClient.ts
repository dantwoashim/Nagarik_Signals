import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey(
  process.env.NAGARIK_PROGRAM_ID ??
    process.env.NEXT_PUBLIC_NAGARIK_PROGRAM_ID ??
    '76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY'
);

export const DEFAULT_RPC =
  process.env.ANCHOR_PROVIDER_URL ??
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
  'https://api.devnet.solana.com';

export type CliOptions = Record<string, string | boolean>;

export function parseArgs(argv = process.argv.slice(2)): CliOptions {
  const options: CliOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }
  return options;
}

export function expandHome(path: string) {
  if (path === '~') return homedir();
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    return resolve(homedir(), path.slice(2));
  }
  return path;
}

export function defaultWalletPath() {
  return resolve(homedir(), '.config', 'solana', 'id.json');
}

export function loadKeypair(path?: string | boolean) {
  const rawPath =
    typeof path === 'string'
      ? path
      : process.env.ANCHOR_WALLET ?? process.env.NAGARIK_RELAYER_KEYPAIR ?? defaultWalletPath();
  const keypairPath = expandHome(rawPath);
  if (!existsSync(keypairPath)) {
    throw new Error(`Keypair not found at ${keypairPath}`);
  }
  const secret = JSON.parse(readFileSync(keypairPath, 'utf8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export function getConnection(rpcUrl = DEFAULT_RPC) {
  return new Connection(rpcUrl, 'confirmed');
}

export function getProvider(keypair = loadKeypair(), rpcUrl = DEFAULT_RPC) {
  const connection = getConnection(rpcUrl);
  return new anchor.AnchorProvider(connection, new anchor.Wallet(keypair), {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
}

export function loadIdl() {
  const idlPath = resolve(
    process.cwd(),
    'programs',
    'nagarik_signal',
    'target',
    'idl',
    'nagarik_signal.json'
  );
  const sourceIdlPath = resolve(process.cwd(), 'idl', 'nagarik_signal.json');
  const chosenPath = existsSync(idlPath) ? idlPath : sourceIdlPath;
  if (!existsSync(chosenPath)) {
    throw new Error(`IDL not found. Checked ${idlPath} and ${sourceIdlPath}.`);
  }
  const idl = JSON.parse(readFileSync(chosenPath, 'utf8')) as anchor.Idl & { address?: string };
  idl.address = PROGRAM_ID.toBase58();
  return idl;
}

export function getProgram(provider = getProvider()) {
  return new anchor.Program(loadIdl(), provider);
}

export function u64Le(value: string | number | bigint | anchor.BN) {
  const bigint =
    value instanceof anchor.BN ? BigInt(value.toString()) : BigInt(value);
  if (bigint < 0n || bigint > 18_446_744_073_709_551_615n) {
    throw new Error(`Value ${String(value)} is outside u64 range`);
  }
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(bigint);
  return buffer;
}

export function u32Le(value: string | number | bigint) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0 || numberValue > 4_294_967_295) {
    throw new Error(`Value ${String(value)} is outside u32 range`);
  }
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(numberValue, 0);
  return buffer;
}

export function deriveRegistryPda() {
  return PublicKey.findProgramAddressSync([Buffer.from('registry')], PROGRAM_ID)[0];
}

export function deriveIssuePda(issueId: string | number | bigint | anchor.BN) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('issue'), u64Le(issueId)],
    PROGRAM_ID
  )[0];
}

export function deriveStewardPda(wallet: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('steward'), wallet.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function deriveVerificationPda(issue: PublicKey, verifier: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('verification'), issue.toBuffer(), verifier.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function deriveStatusUpdatePda(issue: PublicKey, seq: string | number | bigint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('status_update'), issue.toBuffer(), u32Le(seq)],
    PROGRAM_ID
  )[0];
}

export function sha256Hex(input: string | Buffer | Uint8Array) {
  return createHash('sha256').update(input).digest('hex');
}

export function hexToBytes32(hex: string) {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(`Expected 32-byte hex string, got ${hex}`);
  }
  return Array.from(Buffer.from(normalized, 'hex'));
}

export function bytesToHex(bytes: unknown) {
  if (Array.isArray(bytes)) return Buffer.from(bytes).toString('hex');
  if (bytes instanceof Uint8Array) return Buffer.from(bytes).toString('hex');
  if (Buffer.isBuffer(bytes)) return bytes.toString('hex');
  throw new Error('Cannot convert value to hex bytes');
}

export function explorerUrl(signatureOrAddress: string, cluster = 'devnet') {
  return `https://explorer.solana.com/address/${signatureOrAddress}?cluster=${cluster}`;
}

export async function ensureRegistry(program = getProgram()) {
  const registry = deriveRegistryPda();
  try {
    const account = await program.account.registry.fetch(registry);
    return { registry, account, created: false, txSig: null as string | null };
  } catch {
    const txSig = await program.methods
      .initializeRegistry()
      .accounts({
        registry,
        authority: program.provider.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    const account = await program.account.registry.fetch(registry);
    return { registry, account, created: true, txSig };
  }
}

export async function ensureSteward(program = getProgram(), wallet = program.provider.publicKey) {
  const registry = deriveRegistryPda();
  const steward = deriveStewardPda(wallet);
  try {
    const account = await program.account.steward.fetch(steward);
    return { steward, account, created: false, txSig: null as string | null };
  } catch {
    const txSig = await program.methods
      .addSteward()
      .accounts({
        registry,
        authority: program.provider.publicKey,
        wallet,
        steward,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    const account = await program.account.steward.fetch(steward);
    return { steward, account, created: true, txSig };
  }
}

export async function fundSignerIfNeeded(
  connection: Connection,
  payer: Keypair,
  target: PublicKey,
  lamports = 500_000_000
) {
  const minimumLamports = Number(process.env.NAGARIK_SESSION_MIN_BALANCE_LAMPORTS ?? 20_000_000);
  const payerReserveLamports = Number(process.env.NAGARIK_RELAYER_RESERVE_LAMPORTS ?? 10_000_000);
  const balance = await connection.getBalance(target);
  if (balance >= minimumLamports) return { funded: false, txSig: null as string | null };
  const payerBalance = await connection.getBalance(payer.publicKey);
  const availableLamports = Math.max(0, payerBalance - payerReserveLamports);
  const neededLamports = Math.max(0, minimumLamports - balance);
  const transferLamports = Math.min(lamports, neededLamports, availableLamports);
  if (transferLamports <= 0) {
    throw new Error(
      `relayer_insufficient_balance_for_session_funding: payer=${payer.publicKey.toBase58()} balance=${payerBalance} target=${target.toBase58()} targetBalance=${balance} required=${neededLamports}`
    );
  }
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: target,
      lamports: transferLamports,
    })
  );
  const txSig = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: 'confirmed',
  });
  return { funded: true, txSig };
}
