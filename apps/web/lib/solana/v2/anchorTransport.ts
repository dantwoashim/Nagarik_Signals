import { createHash } from 'node:crypto';

import { AnchorProvider, BN, Program, Wallet } from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';

import type { PreparedChainJob } from '../../chain/chainJob';
import type {
  ChainProfile,
  ChainSimulation,
  ObservedCommitmentEvent,
  V2ChainTransport,
} from '../../chain/signer';
import { nagarikSignalV2Idl } from './idl';
import {
  deriveCommitmentEventPda,
  deriveIssuePda,
  deriveProtocolPda,
  deriveRoleGrantPda,
  V2_PROGRAM_ID,
} from './protocol';

type MethodBuilder = {
  accountsStrict(accounts: Record<string, PublicKey>): {
    instruction(): Promise<TransactionInstruction>;
  };
};

type V2Methods = {
  createIssue(
    issueKey: number[],
    eventId: number[],
    category: number,
    payloadHash: number[],
    metadataHash: number[],
    evidenceHash: number[],
    locationHash: number[],
  ): MethodBuilder;
  commitMetadataVersion(
    eventId: number[],
    expectedUpdateCount: BN,
    expectedTimelineHead: number[],
    expectedHandoffHead: number[],
    expectedCategory: number,
    newCategory: number,
    payloadHash: number[],
    newMetadataHash: number[],
    newEvidenceHash: number[],
    newLocationHash: number[],
  ): MethodBuilder;
  appendLifecycle(
    eventId: number[],
    expectedUpdateCount: BN,
    expectedTimelineHead: number[],
    expectedHandoffHead: number[],
    expectedLifecycle: number,
    newLifecycle: number,
    payloadHash: number[],
  ): MethodBuilder;
  checkpointHandoff(
    eventId: number[],
    expectedUpdateCount: BN,
    expectedTimelineHead: number[],
    expectedHandoffHead: number[],
    payloadHash: number[],
  ): MethodBuilder;
  markPublicationRemoved(
    eventId: number[],
    expectedUpdateCount: BN,
    expectedTimelineHead: number[],
    expectedHandoffHead: number[],
    payloadHash: number[],
    tombstoneMetadataHash: number[],
  ): MethodBuilder;
};

type CommitmentEventAccount = {
  issue: PublicKey;
  eventId: number[];
  eventType: number;
  category: number;
  sequence: BN;
  previousHead: number[];
  newHead: number[];
  payloadHash: number[];
  metadataHash: number[];
  issueEvidenceHash: number[];
  locationHash: number[];
  lifecycle: number;
  publicationRemoved: boolean;
};

type V2Accounts = {
  commitmentEvent: {
    fetchNullable(address: PublicKey): Promise<CommitmentEventAccount | null>;
  };
};

function bytes(value: string): number[] {
  return [...Buffer.from(value, 'hex')];
}

function hex(value: number[]): string {
  return Buffer.from(value).toString('hex');
}

export class AnchorV2Transport implements V2ChainTransport {
  readonly profile: ChainProfile;
  private readonly program: Program;
  private readonly methods: V2Methods;
  private readonly accounts: V2Accounts;

  constructor(
    private readonly connection: Connection,
    private readonly authority: Keypair,
    profile: Omit<ChainProfile, 'programId' | 'authority'>,
  ) {
    this.profile = {
      ...profile,
      programId: V2_PROGRAM_ID.toBase58(),
      authority: authority.publicKey.toBase58(),
    };
    const provider = new AnchorProvider(
      connection,
      new Wallet(authority),
      AnchorProvider.defaultOptions(),
    );
    this.program = new Program(nagarikSignalV2Idl, provider);
    if (!this.program.programId.equals(V2_PROGRAM_ID)) throw new Error('v2_idl_program_mismatch');
    this.methods = this.program.methods as unknown as V2Methods;
    this.accounts = this.program.account as unknown as V2Accounts;
  }

  private async instruction(job: PreparedChainJob): Promise<TransactionInstruction> {
    const [protocolConfig] = deriveProtocolPda();
    const [roleGrant] = deriveRoleGrantPda(this.authority.publicKey);
    const [issueCommitment] = deriveIssuePda(job.issueKeyBytes);
    const [commitmentEvent] = deriveCommitmentEventPda(issueCommitment, job.eventIdBytes);
    const accounts = {
      actor: this.authority.publicKey,
      protocolConfig,
      roleGrant,
      issueCommitment,
      commitmentEvent,
      systemProgram: SystemProgram.programId,
    };
    const eventId = bytes(job.eventId);
    const expectedCount = new BN(job.expected.updateCount);
    const expectedTimeline = bytes(job.expected.timelineHead);
    const expectedHandoff = bytes(job.expected.handoffHead);
    const payloadHash = bytes(job.payloadHash);

    if (job.operation === 'issue_created') {
      return this.methods
        .createIssue(
          bytes(job.issueKey),
          eventId,
          job.next.category,
          payloadHash,
          bytes(job.next.metadataHash),
          bytes(job.next.evidenceHash),
          bytes(job.next.locationHash),
        )
        .accountsStrict(accounts)
        .instruction();
    }
    if (job.operation === 'metadata_version_committed') {
      return this.methods
        .commitMetadataVersion(
          eventId,
          expectedCount,
          expectedTimeline,
          expectedHandoff,
          job.expected.category,
          job.next.category,
          payloadHash,
          bytes(job.next.metadataHash),
          bytes(job.next.evidenceHash),
          bytes(job.next.locationHash),
        )
        .accountsStrict(accounts)
        .instruction();
    }
    if (job.operation === 'lifecycle_changed') {
      return this.methods
        .appendLifecycle(
          eventId,
          expectedCount,
          expectedTimeline,
          expectedHandoff,
          job.expected.lifecycle,
          job.next.lifecycle,
          payloadHash,
        )
        .accountsStrict(accounts)
        .instruction();
    }
    if (job.operation === 'handoff_checkpointed') {
      return this.methods
        .checkpointHandoff(eventId, expectedCount, expectedTimeline, expectedHandoff, payloadHash)
        .accountsStrict(accounts)
        .instruction();
    }
    return this.methods
      .markPublicationRemoved(
        eventId,
        expectedCount,
        expectedTimeline,
        expectedHandoff,
        payloadHash,
        bytes(job.next.metadataHash),
      )
      .accountsStrict(accounts)
      .instruction();
  }

  private async transaction(job: PreparedChainJob): Promise<Transaction> {
    const latest = await this.connection.getLatestBlockhash('finalized');
    const transaction = new Transaction({
      feePayer: this.authority.publicKey,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    });
    transaction.add(await this.instruction(job));
    transaction.sign(this.authority);
    return transaction;
  }

  async readEvent(job: PreparedChainJob): Promise<ObservedCommitmentEvent | null> {
    const [issueAccount] = deriveIssuePda(job.issueKeyBytes);
    const [eventAccount] = deriveCommitmentEventPda(issueAccount, job.eventIdBytes);
    const [decoded, raw, signatures] = await Promise.all([
      this.accounts.commitmentEvent.fetchNullable(eventAccount),
      this.connection.getAccountInfo(eventAccount, 'finalized'),
      this.connection.getSignaturesForAddress(eventAccount, { limit: 20 }, 'finalized'),
    ]);
    if (!decoded && !raw) return null;
    if (!decoded || !raw || !raw.owner.equals(V2_PROGRAM_ID)) {
      throw new Error('v2_event_account_invalid');
    }
    const successful = signatures.find((entry) => entry.err === null);
    if (!successful) throw new Error('v2_event_signature_missing');
    return {
      issueAccount: decoded.issue.toBase58(),
      eventAccount: eventAccount.toBase58(),
      eventId: hex(decoded.eventId),
      eventType: decoded.eventType,
      category: decoded.category,
      sequence: decoded.sequence.toNumber(),
      previousHead: hex(decoded.previousHead),
      newHead: hex(decoded.newHead),
      payloadHash: hex(decoded.payloadHash),
      metadataHash: hex(decoded.metadataHash),
      issueEvidenceHash: hex(decoded.issueEvidenceHash),
      locationHash: hex(decoded.locationHash),
      lifecycle: decoded.lifecycle,
      publicationRemoved: decoded.publicationRemoved,
      signature: successful.signature,
      finalizedSlot: successful.slot,
      accountSha256: createHash('sha256').update(raw.data).digest('hex'),
    };
  }

  async simulate(job: PreparedChainJob): Promise<ChainSimulation> {
    const transaction = await this.transaction(job);
    const [simulation, fee] = await Promise.all([
      this.connection.simulateTransaction(transaction),
      this.connection.getFeeForMessage(transaction.compileMessage(), 'finalized'),
    ]);
    return {
      ok: simulation.value.err === null,
      programId: V2_PROGRAM_ID.toBase58(),
      authority: this.authority.publicKey.toBase58(),
      instructionCount: transaction.instructions.length,
      computeUnits: simulation.value.unitsConsumed ?? 0,
      feeLamports: fee.value ?? Number.MAX_SAFE_INTEGER,
      hasValueTransfer: false,
    };
  }

  async submit(job: PreparedChainJob): Promise<string> {
    return sendAndConfirmTransaction(
      this.connection,
      await this.transaction(job),
      [this.authority],
      {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      },
    );
  }

  async confirm(job: PreparedChainJob, signature: string): Promise<ObservedCommitmentEvent | null> {
    const confirmation = await this.connection.confirmTransaction(signature, 'finalized');
    if (confirmation.value.err) throw new Error('v2_transaction_failed');
    const observed = await this.readEvent(job);
    return observed ? { ...observed, signature } : null;
  }
}
