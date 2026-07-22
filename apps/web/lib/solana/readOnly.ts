import 'server-only';

import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import idlSource from '../../../../idl/nagarik_signal.json';
import { appConfig } from '../constants/config';
import { statusFromProgramValue } from './mappers';

export const READONLY_PROGRAM_ID = new PublicKey(
  process.env.NAGARIK_PROGRAM_ID ??
    process.env.NEXT_PUBLIC_NAGARIK_PROGRAM_ID ??
    appConfig.programId
);

const READONLY_RPC =
  process.env.ANCHOR_PROVIDER_URL ??
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
  appConfig.rpcUrl;

export type ChainIssue = {
  issueId: number;
  issuePda: string;
  reporterPubkey: string;
  category: number;
  status: ReturnType<typeof statusFromProgramValue>;
  firstObservedAt: string;
  proofAnchoredAt: string | null;
  updatedAt: string | null;
  resolvedAt: string | null;
  metadataHash: string;
  evidenceHash: string;
  locationHash: string;
  verificationCount: number;
  updateCount: number;
  timelineHash: string;
  resolutionHash: string;
};

let cachedReadOnlyKeypair: Keypair | null = null;

function readOnlyWallet() {
  cachedReadOnlyKeypair ??= Keypair.generate();
  return {
    publicKey: cachedReadOnlyKeypair.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(transaction: T) => transaction,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(transactions: T[]) => transactions,
  };
}

function getReadOnlyProgram() {
  const idl = { ...(idlSource as anchor.Idl), address: READONLY_PROGRAM_ID.toBase58() };
  const provider = new anchor.AnchorProvider(new Connection(READONLY_RPC, 'confirmed'), readOnlyWallet(), {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  return new anchor.Program(idl, provider);
}

function u64Le(value: string | number | bigint | anchor.BN) {
  const bigint = value instanceof anchor.BN ? BigInt(value.toString()) : BigInt(value);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(bigint);
  return buffer;
}

function deriveIssuePdaKey(issueId: string | number | bigint | anchor.BN) {
  return PublicKey.findProgramAddressSync([Buffer.from('issue'), u64Le(issueId)], READONLY_PROGRAM_ID)[0];
}

function bytesToHex(bytes: unknown) {
  if (Array.isArray(bytes)) return Buffer.from(bytes).toString('hex');
  if (bytes instanceof Uint8Array) return Buffer.from(bytes).toString('hex');
  if (Buffer.isBuffer(bytes)) return bytes.toString('hex');
  throw new Error('Cannot convert value to hex bytes');
}

function bnToNumber(value: unknown) {
  if (value instanceof anchor.BN) return (value as anchor.BN).toNumber();
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  const maybeBn = value as { toNumber?: () => number } | null;
  if (maybeBn && typeof maybeBn.toNumber === 'function') return maybeBn.toNumber();
  return Number(value);
}

function unixToIso(value: unknown) {
  const numberValue = bnToNumber(value);
  return numberValue > 0 ? new Date(numberValue * 1000).toISOString() : null;
}

export function normalizeIssueAccount(issuePda: string, account: Record<string, unknown>): ChainIssue {
  return {
    issueId: bnToNumber(account.id),
    issuePda,
    reporterPubkey: String(account.reporter),
    category: Number(account.category),
    status: statusFromProgramValue(Number(account.status)),
    firstObservedAt: unixToIso(account.firstObservedAt) ?? new Date(0).toISOString(),
    proofAnchoredAt: unixToIso(account.createdAt),
    updatedAt: unixToIso(account.updatedAt),
    resolvedAt: unixToIso(account.resolvedAt),
    metadataHash: bytesToHex(account.metadataHash),
    evidenceHash: bytesToHex(account.evidenceHash),
    locationHash: bytesToHex(account.locationHash),
    verificationCount: Number(account.verificationCount),
    updateCount: Number(account.updateCount),
    timelineHash: bytesToHex(account.timelineHash),
    resolutionHash: bytesToHex(account.resolutionHash),
  };
}

export async function fetchIssueOnChain(issueId: number) {
  const program = getReadOnlyProgram() as any;
  const issue = deriveIssuePdaKey(issueId);
  const account = await program.account.issue.fetch(issue) as Record<string, unknown>;
  return normalizeIssueAccount(issue.toBase58(), account);
}

export async function fetchAllIssueAccounts() {
  const program = getReadOnlyProgram() as any;
  const rows = await program.account.issue.all() as Array<{ publicKey: { toBase58: () => string }; account: Record<string, unknown> }>;
  return rows.map((row) => normalizeIssueAccount(row.publicKey.toBase58(), row.account));
}
