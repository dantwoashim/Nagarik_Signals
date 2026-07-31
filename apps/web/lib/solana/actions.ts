import 'server-only';

import { Connection, PublicKey } from '@solana/web3.js';

import { V2_PROGRAM_ID } from './v2/protocol';

const V1_PROGRAM_ID = new PublicKey('76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY');

export async function chainHealth(_options: { includeRelayer?: boolean } = {}) {
  const rpcUrl =
    process.env.NAGARIK_RPC_PRIMARY_URL ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    'http://127.0.0.1:8899';
  const connection = new Connection(rpcUrl, 'finalized');
  const [blockhash, v1Program, v2Program] = await Promise.all([
    connection.getLatestBlockhash('finalized'),
    connection.getAccountInfo(V1_PROGRAM_ID, 'finalized'),
    connection.getAccountInfo(V2_PROGRAM_ID, 'finalized'),
  ]);
  return {
    ok: Boolean(blockhash.blockhash && v1Program?.executable && v2Program?.executable),
    blockhash: blockhash.blockhash,
    lastValidBlockHeight: blockhash.lastValidBlockHeight,
    relayerPubkey: null,
    relayerBalanceSol: null,
    programDeployed: Boolean(v2Program?.executable),
    v1LegacyProgramDeployed: Boolean(v1Program?.executable),
    v2ProgramDeployed: Boolean(v2Program?.executable),
  };
}
