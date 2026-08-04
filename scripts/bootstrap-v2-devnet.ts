import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { AnchorProvider, BN, Program, Wallet } from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';

const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const PROGRAM_ID = new PublicKey('A1PDikCUQekCAbc8CHcZgEFwxxhEyspfHGEbG7PX4URP');
const GENESIS_AUTHORITY = new PublicKey('94GGj4zzhRQV5FzpL3RmYoZrH5qoLhdRMKYj9t9ndv5i');
const ROLE_ALL = 0x000f;

type Builder = {
  accountsStrict(accounts: Record<string, PublicKey>): {
    signers(signers: Keypair[]): { rpc(): Promise<string> };
  };
};

type BootstrapMethods = {
  initializeProtocol(): Builder;
  setRole(
    expectedConfigRevision: BN,
    expectedGrantRevision: BN,
    roleBits: number,
    active: boolean,
  ): Builder;
  setPause(expectedConfigRevision: BN, paused: boolean): Builder;
};

type ProtocolConfig = {
  version: number;
  authority: PublicKey;
  paused: boolean;
  revision: BN;
};

type RoleGrant = {
  roleBits: number;
  active: boolean;
  revision: BN;
};

type BootstrapAccounts = {
  protocolConfig: { fetchNullable(address: PublicKey): Promise<ProtocolConfig | null> };
  roleGrant: { fetchNullable(address: PublicKey): Promise<RoleGrant | null> };
};

function keypair(path: string): Keypair {
  const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (
    !Array.isArray(value) ||
    value.length !== 64 ||
    value.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > 255)
  ) {
    throw new Error(`invalid_keypair:${path}`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(value as number[]));
}

async function main() {
  const rpcUrl = process.env.NAGARIK_BOOTSTRAP_RPC_URL ?? 'https://api.devnet.solana.com';
  const payer = keypair(
    resolve(process.env.NAGARIK_BOOTSTRAP_PAYER_PATH ?? `${homedir()}/.config/solana/id.json`),
  );
  const genesisAuthority = keypair(
    resolve(
      process.env.NAGARIK_BOOTSTRAP_GENESIS_PATH ??
        'target/deploy/nagarik_signal_v2-genesis-authority.json',
    ),
  );
  const serviceAuthority = keypair(
    resolve(
      process.env.NAGARIK_BOOTSTRAP_SERVICE_PATH ??
        'target/deploy/nagarik_signal_v2-service-authority.json',
    ),
  );
  assert.equal(genesisAuthority.publicKey.toBase58(), GENESIS_AUTHORITY.toBase58());
  assert.notEqual(serviceAuthority.publicKey.toBase58(), payer.publicKey.toBase58());
  assert.notEqual(serviceAuthority.publicKey.toBase58(), GENESIS_AUTHORITY.toBase58());

  const connection = new Connection(rpcUrl, 'finalized');
  assert.equal(await connection.getGenesisHash(), DEVNET_GENESIS_HASH, 'devnet genesis required');
  const programAccount = await connection.getAccountInfo(PROGRAM_ID, 'finalized');
  assert.ok(programAccount?.executable, 'v2 program is not deployed');

  const idl = JSON.parse(readFileSync(resolve('idl/nagarik_signal_v2.json'), 'utf8'));
  const provider = new AnchorProvider(connection, new Wallet(payer), {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  const program = new Program(idl, provider);
  assert.equal(program.programId.toBase58(), PROGRAM_ID.toBase58());
  const methods = program.methods as unknown as BootstrapMethods;
  const accounts = program.account as unknown as BootstrapAccounts;
  const [protocolConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('protocol'), Buffer.from('v2')],
    PROGRAM_ID,
  );
  const [roleGrant] = PublicKey.findProgramAddressSync(
    [Buffer.from('role'), protocolConfig.toBuffer(), serviceAuthority.publicKey.toBuffer()],
    PROGRAM_ID,
  );
  const signatures: string[] = [];

  async function recordFinalized(signature: string) {
    const confirmation = await connection.confirmTransaction(signature, 'finalized');
    assert.equal(confirmation.value.err, null, 'bootstrap transaction failed');
    signatures.push(signature);
  }

  async function fund(publicKey: PublicKey, minimumSol: number) {
    const minimum = Math.floor(minimumSol * LAMPORTS_PER_SOL);
    const current = await connection.getBalance(publicKey, 'confirmed');
    if (current >= minimum) return;
    await recordFinalized(
      await provider.sendAndConfirm(
        new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: publicKey,
            lamports: minimum - current,
          }),
        ),
      ),
    );
  }

  await fund(genesisAuthority.publicKey, 0.03);
  await fund(serviceAuthority.publicKey, 0.1);

  let config = await accounts.protocolConfig.fetchNullable(protocolConfig);
  if (!config) {
    await recordFinalized(
      await methods
        .initializeProtocol()
        .accountsStrict({
          payer: payer.publicKey,
          genesisAuthority: genesisAuthority.publicKey,
          protocolConfig,
          systemProgram: SystemProgram.programId,
        })
        .signers([genesisAuthority])
        .rpc(),
    );
    config = await accounts.protocolConfig.fetchNullable(protocolConfig);
  }
  assert.ok(config);
  assert.equal(config.version, 2);
  assert.equal(config.authority.toBase58(), GENESIS_AUTHORITY.toBase58());

  let grant = await accounts.roleGrant.fetchNullable(roleGrant);
  if (!grant || !grant.active || grant.roleBits !== ROLE_ALL) {
    if (!config.paused) {
      await recordFinalized(
        await methods
          .setPause(config.revision, true)
          .accountsStrict({ authority: genesisAuthority.publicKey, protocolConfig })
          .signers([genesisAuthority])
          .rpc(),
      );
      config = await accounts.protocolConfig.fetchNullable(protocolConfig);
      assert.ok(config);
    }
    await recordFinalized(
      await methods
        .setRole(config.revision, grant?.revision ?? new BN(0), ROLE_ALL, true)
        .accountsStrict({
          authority: genesisAuthority.publicKey,
          protocolConfig,
          subject: serviceAuthority.publicKey,
          roleGrant,
          systemProgram: SystemProgram.programId,
        })
        .signers([genesisAuthority])
        .rpc(),
    );
    config = await accounts.protocolConfig.fetchNullable(protocolConfig);
    grant = await accounts.roleGrant.fetchNullable(roleGrant);
  }
  assert.ok(config);
  assert.ok(grant?.active);
  assert.equal(grant.roleBits, ROLE_ALL);

  if (config.paused) {
    await recordFinalized(
      await methods
        .setPause(config.revision, false)
        .accountsStrict({ authority: genesisAuthority.publicKey, protocolConfig })
        .signers([genesisAuthority])
        .rpc(),
    );
    config = await accounts.protocolConfig.fetchNullable(protocolConfig);
  }
  assert.equal(config?.paused, false);

  console.log(
    JSON.stringify(
      {
        ok: true,
        network: 'devnet',
        genesisHash: DEVNET_GENESIS_HASH,
        programId: PROGRAM_ID.toBase58(),
        protocolConfig: protocolConfig.toBase58(),
        serviceAuthority: serviceAuthority.publicKey.toBase58(),
        roleGrant: roleGrant.toBase58(),
        roleBits: ROLE_ALL,
        paused: false,
        serviceBalanceLamports: await connection.getBalance(
          serviceAuthority.publicKey,
          'finalized',
        ),
        signatures,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
