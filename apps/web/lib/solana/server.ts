import 'server-only';

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
  PublicKey,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { appConfig } from '../constants/config';
import { idlPathCandidates, sessionKeypairDir } from '../server/paths';
import { deriveSessionKeypair, parseRelayerSecretKey } from './identity';

export const PROGRAM_ID = new PublicKey(
  process.env.NAGARIK_PROGRAM_ID ??
    process.env.NEXT_PUBLIC_NAGARIK_PROGRAM_ID ??
    appConfig.programId
);

export const DEFAULT_RPC =
  process.env.ANCHOR_PROVIDER_URL ??
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
  appConfig.rpcUrl;

function expandHome(path: string) {
  if (path === '~') return homedir();
  if (path.startsWith('~/') || path.startsWith('~\\')) return resolve(homedir(), path.slice(2));
  return path;
}

export function defaultWalletPath() {
  return resolve(homedir(), '.config', 'solana', 'id.json');
}

export function loadKeypair(path?: string | null) {
  if (!path) {
    const inlineSecret = process.env.NAGARIK_RELAYER_SECRET_KEY;
    if (inlineSecret !== undefined) return parseRelayerSecretKey(inlineSecret);
  }
  const rawPath = path || process.env.ANCHOR_WALLET || process.env.NAGARIK_RELAYER_KEYPAIR || defaultWalletPath();
  const keypairPath = expandHome(rawPath);
  if (!existsSync(/* turbopackIgnore: true */ keypairPath)) throw new Error(`Keypair not found at ${keypairPath}`);
  const secret = JSON.parse(readFileSync(/* turbopackIgnore: true */ keypairPath, 'utf8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export function getConnection(rpcUrl = DEFAULT_RPC) {
  return new Connection(rpcUrl, 'confirmed');
}

function keypairWallet(keypair: Keypair) {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(transaction: T) => {
      if (transaction instanceof VersionedTransaction) transaction.sign([keypair]);
      else transaction.partialSign(keypair);
      return transaction;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(transactions: T[]) =>
      Promise.all(
        transactions.map(async (transaction) => {
          if (transaction instanceof VersionedTransaction) transaction.sign([keypair]);
          else transaction.partialSign(keypair);
          return transaction;
        })
      ),
  };
}

export function getProvider(keypair = loadKeypair(), rpcUrl = DEFAULT_RPC) {
  return new anchor.AnchorProvider(getConnection(rpcUrl), keypairWallet(keypair), {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
}

let cachedReadOnlyKeypair: Keypair | null = null;

export function getReadOnlyProvider(rpcUrl = DEFAULT_RPC) {
  cachedReadOnlyKeypair ??= Keypair.generate();
  return new anchor.AnchorProvider(getConnection(rpcUrl), keypairWallet(cachedReadOnlyKeypair), {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
}

export function loadIdl() {
  const idlPath = idlPathCandidates().find((candidate) => existsSync(candidate));
  if (!idlPath) throw new Error(`IDL not found. Checked ${idlPathCandidates().join(', ')}`);
  const idl = JSON.parse(readFileSync(idlPath, 'utf8')) as anchor.Idl & { address?: string };
  idl.address = PROGRAM_ID.toBase58();
  return idl;
}

export function getProgram(provider = getProvider()) {
  return new anchor.Program(loadIdl(), provider);
}

export function getReadOnlyProgram() {
  return getProgram(getReadOnlyProvider());
}

export function providerPublicKey(program: anchor.Program) {
  const publicKey = program.provider.publicKey;
  if (!publicKey) throw new Error('Anchor provider public key is missing.');
  return publicKey;
}

export function u64Le(value: string | number | bigint | anchor.BN) {
  const bigint = value instanceof anchor.BN ? BigInt(value.toString()) : BigInt(value);
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

export function deriveIssuePdaKey(issueId: string | number | bigint | anchor.BN) {
  return PublicKey.findProgramAddressSync([Buffer.from('issue'), u64Le(issueId)], PROGRAM_ID)[0];
}

export function deriveStewardPda(wallet: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from('steward'), wallet.toBuffer()], PROGRAM_ID)[0];
}

export function deriveVerificationPdaKey(issue: PublicKey, verifier: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('verification'), issue.toBuffer(), verifier.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function deriveStatusUpdatePdaKey(issue: PublicKey, seq: string | number | bigint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('status_update'), issue.toBuffer(), u32Le(seq)],
    PROGRAM_ID
  )[0];
}

export function hexToBytes32(hex: string) {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) throw new Error(`Expected 32-byte hex string, got ${hex}`);
  return Array.from(Buffer.from(normalized, 'hex'));
}

export function bytesToHex(bytes: unknown) {
  if (Array.isArray(bytes)) return Buffer.from(bytes).toString('hex');
  if (bytes instanceof Uint8Array) return Buffer.from(bytes).toString('hex');
  if (Buffer.isBuffer(bytes)) return bytes.toString('hex');
  throw new Error('Cannot convert value to hex bytes');
}

export function bnToNumber(value: unknown) {
  if (value instanceof anchor.BN) return (value as anchor.BN).toNumber();
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  const maybeBn = value as { toNumber?: () => number } | null;
  if (maybeBn && typeof maybeBn.toNumber === 'function') {
    return maybeBn.toNumber();
  }
  return Number(value);
}

export function unixToIso(value: unknown) {
  const numberValue = bnToNumber(value);
  return numberValue > 0 ? new Date(numberValue * 1000).toISOString() : null;
}

export async function ensureRegistry(program = getProgram()) {
  const runtimeProgram = program as any;
  const registry = deriveRegistryPda();
  try {
    const account = await runtimeProgram.account.registry.fetch(registry);
    return { registry, account, created: false, txSig: null as string | null };
  } catch {
    const authority = providerPublicKey(program);
    const txSig = await runtimeProgram.methods
      .initializeRegistry()
      .accounts({
        registry,
        authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    const account = await runtimeProgram.account.registry.fetch(registry);
    return { registry, account, created: true, txSig };
  }
}

export async function ensureSteward(program = getProgram(), wallet?: PublicKey) {
  const runtimeProgram = program as any;
  const stewardWallet = wallet ?? providerPublicKey(program);
  const steward = deriveStewardPda(stewardWallet);
  try {
    const account = await runtimeProgram.account.steward.fetch(steward);
    return { steward, account, created: false, txSig: null as string | null };
  } catch {
    const registry = deriveRegistryPda();
    const authority = providerPublicKey(program);
    const txSig = await runtimeProgram.methods
      .addSteward()
      .accounts({
        registry,
        authority,
        wallet: stewardWallet,
        steward,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    const account = await runtimeProgram.account.steward.fetch(steward);
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
  const txSig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: 'confirmed' });
  return { funded: true, txSig };
}

export function sessionKeypairPath(sessionId: string) {
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'anonymous';
  return resolve(sessionKeypairDir(), `${safeId}.json`);
}

export function loadOrCreateSessionKeypair(sessionId: string) {
  const derivationSecret = process.env.NAGARIK_SESSION_DERIVATION_SECRET;
  if (derivationSecret !== undefined) {
    return {
      keypair: deriveSessionKeypair(sessionId, derivationSecret),
      path: null,
      created: false,
      mode: 'deterministic_hmac' as const,
    };
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NAGARIK_SESSION_DERIVATION_SECRET_is_required_in_production');
  }

  const path = sessionKeypairPath(sessionId);
  if (existsSync(path)) {
    const secret = JSON.parse(readFileSync(path, 'utf8')) as number[];
    return { keypair: Keypair.fromSecretKey(Uint8Array.from(secret)), path, created: false, mode: 'local_file' as const };
  }
  mkdirSync(dirname(path), { recursive: true });
  const keypair = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(keypair.secretKey)), 'utf8');
  return { keypair, path, created: true, mode: 'local_file' as const };
}

export function explorerAddressUrl(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=${appConfig.cluster}`;
}

export function explorerTxUrl(txSig: string) {
  return `https://explorer.solana.com/tx/${txSig}?cluster=${appConfig.cluster}`;
}
