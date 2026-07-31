import type { PreparedChainJob } from './chainJob';

import { V2_PROGRAM_ID } from '../solana/v2/protocol';

export type ChainProfile = {
  cluster: 'localnet' | 'testnet' | 'custom';
  genesisHash: string;
  programId: string;
  authority: string;
};

export type ObservedCommitmentEvent = {
  issueAccount: string;
  eventAccount: string;
  eventId: string;
  eventType: number;
  category: number;
  sequence: number;
  previousHead: string;
  newHead: string;
  payloadHash: string;
  metadataHash: string;
  issueEvidenceHash: string;
  locationHash: string;
  lifecycle: number;
  publicationRemoved: boolean;
  signature: string;
  finalizedSlot: number;
  accountSha256: string;
};

export type ChainSimulation = {
  ok: boolean;
  programId: string;
  authority: string;
  instructionCount: number;
  computeUnits: number;
  feeLamports: number;
  hasValueTransfer: boolean;
};

export interface V2ChainTransport {
  readonly profile: ChainProfile;
  readEvent(job: PreparedChainJob): Promise<ObservedCommitmentEvent | null>;
  simulate(job: PreparedChainJob): Promise<ChainSimulation>;
  submit(job: PreparedChainJob): Promise<string>;
  confirm(job: PreparedChainJob, signature: string): Promise<ObservedCommitmentEvent | null>;
}

export interface ChainSigner {
  readonly profile: ChainProfile;
  inspect(job: PreparedChainJob): Promise<ObservedCommitmentEvent | null>;
  submit(job: PreparedChainJob): Promise<string>;
  confirm(job: PreparedChainJob, signature: string): Promise<ObservedCommitmentEvent | null>;
}

export class ChainExecutionError extends Error {
  constructor(
    public readonly category: string,
    public readonly retryable: boolean,
  ) {
    super(category);
    this.name = 'ChainExecutionError';
  }
}

const MAX_COMPUTE_UNITS = 350_000;
const MAX_FEE_LAMPORTS = 50_000;

export class BoundedChainSigner implements ChainSigner {
  readonly profile: ChainProfile;

  constructor(
    private readonly transport: V2ChainTransport,
    expected: { genesisHash: string; authority: string },
  ) {
    this.profile = transport.profile;
    if (
      this.profile.programId !== V2_PROGRAM_ID.toBase58() ||
      this.profile.genesisHash !== expected.genesisHash ||
      this.profile.authority !== expected.authority ||
      this.profile.cluster === ('mainnet-beta' as string) ||
      this.profile.cluster === ('devnet' as string)
    ) {
      throw new ChainExecutionError('chain_profile_mismatch', false);
    }
  }

  inspect(job: PreparedChainJob): Promise<ObservedCommitmentEvent | null> {
    return this.transport.readEvent(job);
  }

  async submit(job: PreparedChainJob): Promise<string> {
    const simulation = await this.transport.simulate(job);
    if (!simulation.ok) throw new ChainExecutionError('chain_simulation_failed', true);
    if (
      simulation.programId !== this.profile.programId ||
      simulation.authority !== this.profile.authority ||
      simulation.instructionCount !== 1 ||
      simulation.computeUnits < 1 ||
      simulation.computeUnits > MAX_COMPUTE_UNITS ||
      simulation.feeLamports < 0 ||
      simulation.feeLamports > MAX_FEE_LAMPORTS ||
      simulation.hasValueTransfer
    ) {
      throw new ChainExecutionError('chain_signing_policy_rejected', false);
    }
    const signature = await this.transport.submit(job);
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,96}$/.test(signature)) {
      throw new ChainExecutionError('chain_signature_invalid', false);
    }
    return signature;
  }

  confirm(job: PreparedChainJob, signature: string): Promise<ObservedCommitmentEvent | null> {
    return this.transport.confirm(job, signature);
  }
}
