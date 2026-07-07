import { PublicKey } from '@solana/web3.js';
import { appConfig } from '../constants/config';

function programKey() {
  return new PublicKey(appConfig.programId);
}

export function issueIdToLeBytes(issueId: string | number | bigint) {
  const value = BigInt(issueId);
  if (value < 0n || value > 18_446_744_073_709_551_615n) {
    throw new Error(`Issue id ${String(issueId)} is outside u64 range`);
  }
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

export function statusSeqToLeBytes(seq: number) {
  if (!Number.isInteger(seq) || seq < 0 || seq > 4_294_967_295) {
    throw new Error(`Status sequence ${seq} is outside u32 range`);
  }
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(seq, 0);
  return bytes;
}

export function deriveIssuePda(issueId: string | number | bigint) {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('issue'), issueIdToLeBytes(issueId)],
    programKey()
  );
  return { pda: pda.toBase58(), bump };
}

export function deriveVerificationPda(issuePda: string, verifierPubkey: string) {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('verification'), new PublicKey(issuePda).toBuffer(), new PublicKey(verifierPubkey).toBuffer()],
    programKey()
  );
  return { pda: pda.toBase58(), bump };
}

export function deriveStatusUpdatePda(issuePda: string, seq: number) {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('status_update'), new PublicKey(issuePda).toBuffer(), statusSeqToLeBytes(seq)],
    programKey()
  );
  return { pda: pda.toBase58(), bump };
}
