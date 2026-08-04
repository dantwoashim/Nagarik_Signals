import { readFile } from 'node:fs/promises';

import { Connection, Keypair } from '@solana/web3.js';

import { AnchorV2Transport } from '../solana/v2/anchorTransport';
import { V2_PROGRAM_ID } from '../solana/v2/protocol';
import { RemoteTransactionAuthority } from './remoteAuthority';
import { BoundedChainSigner, ChainExecutionError, type ChainSigner } from './signer';

function parseSecretKey(value: unknown): Uint8Array {
  if (
    !Array.isArray(value) ||
    value.length !== 64 ||
    value.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > 255)
  ) {
    throw new ChainExecutionError('chain_local_signer_invalid', false);
  }
  return Uint8Array.from(value as number[]);
}

export async function createConfiguredChainSigner(
  env: Record<string, unknown> = process.env,
): Promise<ChainSigner> {
  const value = (key: string): string | undefined =>
    typeof env[key] === 'string' ? env[key] : undefined;
  const production = value('NODE_ENV') === 'production';
  const rpcUrl = value('NAGARIK_RPC_PRIMARY_URL');
  const cluster = value('NAGARIK_SOLANA_CLUSTER');
  if (!rpcUrl || !cluster) {
    throw new ChainExecutionError('chain_profile_incomplete', false);
  }
  if (!['localnet', 'testnet', 'custom'].includes(cluster)) {
    throw new ChainExecutionError('chain_cluster_invalid', false);
  }
  if (
    value('NAGARIK_V2_PROGRAM_ID') &&
    value('NAGARIK_V2_PROGRAM_ID') !== V2_PROGRAM_ID.toBase58()
  ) {
    throw new ChainExecutionError('chain_program_id_mismatch', false);
  }

  let authority: Keypair | RemoteTransactionAuthority;
  if (production) {
    const endpoint = value('NAGARIK_V2_SIGNER_ENDPOINT');
    const secret = value('NAGARIK_V2_SIGNER_AUTH_SECRET');
    const publicKey = value('NAGARIK_V2_SIGNER_PUBLIC_KEY');
    if (!endpoint || !secret || !publicKey || value('NAGARIK_V2_LOCAL_SIGNER_PATH')) {
      throw new ChainExecutionError('chain_remote_signer_profile_incomplete', false);
    }
    authority = new RemoteTransactionAuthority({ endpoint, secret, publicKey });
  } else {
    const signerPath = value('NAGARIK_V2_LOCAL_SIGNER_PATH');
    if (!signerPath) throw new ChainExecutionError('chain_local_profile_incomplete', false);
    authority = Keypair.fromSecretKey(
      parseSecretKey(JSON.parse(await readFile(signerPath, 'utf8')) as unknown),
    );
    if (
      value('NAGARIK_V2_SIGNER_PUBLIC_KEY') &&
      value('NAGARIK_V2_SIGNER_PUBLIC_KEY') !== authority.publicKey.toBase58()
    ) {
      throw new ChainExecutionError('chain_signer_public_key_mismatch', false);
    }
  }

  const connection = new Connection(rpcUrl, 'finalized');
  const genesisHash = await connection.getGenesisHash();
  if (
    value('NAGARIK_SOLANA_GENESIS_HASH') &&
    value('NAGARIK_SOLANA_GENESIS_HASH') !== genesisHash
  ) {
    throw new ChainExecutionError('chain_genesis_hash_mismatch', false);
  }
  const transport = new AnchorV2Transport(connection, authority, {
    cluster: cluster as 'localnet' | 'testnet' | 'custom',
    genesisHash,
  });
  return new BoundedChainSigner(transport, {
    genesisHash,
    authority: authority.publicKey.toBase58(),
  });
}
