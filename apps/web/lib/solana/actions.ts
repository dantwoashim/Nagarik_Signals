import 'server-only';

import * as anchor from '@coral-xyz/anchor';
import { Keypair, SystemProgram } from '@solana/web3.js';
import type { IssueCategory, IssueStatus } from '../types';
import { categoryToProgramValue, statusFromProgramValue, statusToProgramValue } from './mappers';
import { normalizeIssueAccount } from './readOnly';
import {
  bnToNumber,
  deriveIssuePdaKey,
  deriveStatusUpdatePdaKey,
  deriveVerificationPdaKey,
  ensureRegistry,
  ensureSteward,
  fundSignerIfNeeded,
  getConnection,
  getProgram,
  getProvider,
  hexToBytes32,
  loadKeypair,
  PROGRAM_ID,
  providerPublicKey,
} from './server';

export async function fetchRegistryIssueCount() {
  const program = getProgram();
  const registryState = await ensureRegistry(program);
  return {
    issueCount: bnToNumber(registryState.account.issueCount),
    registryCreated: registryState.created,
    registryInitTxSig: registryState.txSig,
  };
}

export async function createIssueOnChain(input: {
  category: IssueCategory;
  firstObservedAt: string;
  metadataHash: string;
  evidenceHash: string;
  locationHash: string;
  reporter?: Keypair;
}) {
  const authorityProgram = getProgram();
  const registryState = await ensureRegistry(authorityProgram);
  const issueId = bnToNumber(registryState.account.issueCount) + 1;
  const issue = deriveIssuePdaKey(issueId);
  const firstObservedUnix = Math.floor(Date.parse(input.firstObservedAt) / 1000);
  const reporter = input.reporter ?? loadKeypair();
  const payer = loadKeypair();
  if (!reporter.publicKey.equals(payer.publicKey)) {
    await fundSignerIfNeeded(getConnection(), payer, reporter.publicKey);
  }
  const program = getProgram(getProvider(reporter));
  const runtimeProgram = program as any;

  const txSig = await runtimeProgram.methods
    .createIssue(
      new anchor.BN(issueId),
      categoryToProgramValue(input.category),
      new anchor.BN(firstObservedUnix),
      hexToBytes32(input.metadataHash),
      hexToBytes32(input.evidenceHash),
      hexToBytes32(input.locationHash)
    )
    .accounts({
      registry: registryState.registry,
      reporter: reporter.publicKey,
      issue,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const issueAccount = await runtimeProgram.account.issue.fetch(issue) as Record<string, unknown>;
  return {
    issueId,
    issuePda: issue.toBase58(),
    reporterPubkey: reporter.publicKey.toBase58(),
    txSig,
    registryCreated: registryState.created,
    registryInitTxSig: registryState.txSig,
    chainIssue: normalizeIssueAccount(issue.toBase58(), issueAccount),
  };
}

export async function verifyIssueOnChain(issueId: number, verifier: Keypair) {
  const payer = loadKeypair();
  const connection = getConnection();
  if (!verifier.publicKey.equals(payer.publicKey)) {
    await fundSignerIfNeeded(connection, payer, verifier.publicKey);
  }
  const provider = getProvider(verifier);
  const program = getProgram(provider);
  const runtimeProgram = program as any;
  const issue = deriveIssuePdaKey(issueId);
  const verification = deriveVerificationPdaKey(issue, verifier.publicKey);
  const txSig = await runtimeProgram.methods
    .verifyIssue(new anchor.BN(issueId))
    .accounts({
      issue,
      verifier: verifier.publicKey,
      verification,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  const issueAccount = await runtimeProgram.account.issue.fetch(issue) as Record<string, unknown>;
  return {
    issueId,
    issuePda: issue.toBase58(),
    verifierPubkey: verifier.publicKey.toBase58(),
    verificationPda: verification.toBase58(),
    txSig,
    chainIssue: normalizeIssueAccount(issue.toBase58(), issueAccount),
  };
}

export async function updateStatusOnChain(issueId: number, newStatus: IssueStatus, proofHash: string) {
  const program = getProgram();
  const runtimeProgram = program as any;
  const updater = providerPublicKey(program);
  const issue = deriveIssuePdaKey(issueId);
  const before = await runtimeProgram.account.issue.fetch(issue) as Record<string, unknown>;
  const seq = bnToNumber(before.updateCount) + 1;
  const stewardState = await ensureSteward(program, updater);
  const statusUpdate = deriveStatusUpdatePdaKey(issue, seq);
  const txSig = await runtimeProgram.methods
    .updateStatus(seq, statusToProgramValue(newStatus), hexToBytes32(proofHash))
    .accounts({
      issue,
      steward: stewardState.steward,
      updater,
      statusUpdate,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  const after = await runtimeProgram.account.issue.fetch(issue) as Record<string, unknown>;
  return {
    issueId,
    issuePda: issue.toBase58(),
    statusUpdatePda: statusUpdate.toBase58(),
    seq,
    oldStatus: statusFromProgramValue(Number(before.status)),
    newStatus: statusFromProgramValue(Number(after.status)),
    txSig,
    stewardCreated: stewardState.created,
    stewardCreateTxSig: stewardState.txSig,
    updaterPubkey: updater.toBase58(),
    chainIssue: normalizeIssueAccount(issue.toBase58(), after),
  };
}

export async function chainHealth(options: { includeRelayer?: boolean } = {}) {
  const connection = getConnection();
  const relayer = options.includeRelayer === false ? null : loadKeypair();
  const [blockhash, balance, programAccount] = await Promise.all([
    connection.getLatestBlockhash('confirmed'),
    relayer ? connection.getBalance(relayer.publicKey) : Promise.resolve(null),
    connection.getAccountInfo(PROGRAM_ID),
  ]);
  return {
    ok: Boolean(blockhash.blockhash && programAccount),
    blockhash: blockhash.blockhash,
    lastValidBlockHeight: blockhash.lastValidBlockHeight,
    relayerPubkey: relayer?.publicKey.toBase58() ?? null,
    relayerBalanceSol: balance === null ? null : balance / 1_000_000_000,
    programDeployed: Boolean(programAccount?.executable),
  };
}
