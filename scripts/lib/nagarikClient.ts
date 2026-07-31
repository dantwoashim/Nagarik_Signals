import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY');
export const DEFAULT_RPC =
  process.env.NAGARIK_RPC_PRIMARY_URL ??
  process.env.ANCHOR_PROVIDER_URL ??
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
  'http://127.0.0.1:8899';

export type CliOptions = Record<string, string | boolean>;

export function parseArgs(argv = process.argv.slice(2)): CliOptions {
  const options: CliOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) options[key] = true;
    else {
      options[key] = next;
      index += 1;
    }
  }
  return options;
}

export function getConnection(rpcUrl = DEFAULT_RPC) {
  return new Connection(rpcUrl, 'finalized');
}

function readOnlyWallet() {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey,
    async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T) {
      return transaction;
    },
    async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]) {
      return transactions;
    },
  };
}

function loadIdl() {
  const path = resolve(process.cwd(), 'idl', 'nagarik_signal_v1.json');
  if (!existsSync(path)) throw new Error(`Frozen v1 IDL not found at ${path}`);
  return JSON.parse(readFileSync(path, 'utf8')) as anchor.Idl;
}

export function getProgram(rpcUrl = DEFAULT_RPC) {
  const provider = new anchor.AnchorProvider(getConnection(rpcUrl), readOnlyWallet(), {
    commitment: 'finalized',
    preflightCommitment: 'finalized',
  });
  return new anchor.Program(loadIdl(), provider);
}

function u64Le(value: string | number | bigint | anchor.BN) {
  const bigint = value instanceof anchor.BN ? BigInt(value.toString()) : BigInt(value);
  if (bigint < 0n || bigint > 18_446_744_073_709_551_615n) {
    throw new Error(`Value ${String(value)} is outside u64 range`);
  }
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(bigint);
  return buffer;
}

export function deriveIssuePda(issueId: string | number | bigint | anchor.BN) {
  return PublicKey.findProgramAddressSync([Buffer.from('issue'), u64Le(issueId)], PROGRAM_ID)[0];
}

export function bytesToHex(bytes: unknown) {
  if (Array.isArray(bytes)) return Buffer.from(bytes).toString('hex');
  if (bytes instanceof Uint8Array) return Buffer.from(bytes).toString('hex');
  if (Buffer.isBuffer(bytes)) return bytes.toString('hex');
  throw new Error('Cannot convert value to hex bytes');
}
