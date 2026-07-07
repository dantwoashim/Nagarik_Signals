import * as anchor from '@coral-xyz/anchor';
import { SystemProgram } from '@solana/web3.js';
import {
  deriveIssuePda,
  deriveVerificationPda,
  fundSignerIfNeeded,
  getConnection,
  getProgram,
  loadKeypair,
  parseArgs,
} from './lib/nagarikClient';

async function main() {
  const options = parseArgs();
  const issueId = Number(options['issue-id'] ?? options.id ?? 1);
  const verifierKeypair = loadKeypair(options.keypair);
  const payerKeypair = loadKeypair();
  const connection = getConnection();

  if (verifierKeypair.publicKey.toBase58() !== payerKeypair.publicKey.toBase58()) {
    await fundSignerIfNeeded(connection, payerKeypair, verifierKeypair.publicKey);
  }

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(verifierKeypair),
    { commitment: 'confirmed', preflightCommitment: 'confirmed' }
  );
  const verifierProgram = getProgram(provider);
  const issue = deriveIssuePda(issueId);
  const verification = deriveVerificationPda(issue, verifierKeypair.publicKey);

  const txSig = await verifierProgram.methods
    .verifyIssue(new anchor.BN(issueId))
    .accounts({
      issue,
      verifier: verifierKeypair.publicKey,
      verification,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const issueAccount = await verifierProgram.account.issue.fetch(issue);

  console.log(JSON.stringify({
    ok: true,
    action: 'verify_issue',
    issueId,
    issuePda: issue.toBase58(),
    verifier: verifierKeypair.publicKey.toBase58(),
    verificationPda: verification.toBase58(),
    txSig,
    status: issueAccount.status,
    verificationCount: issueAccount.verificationCount,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
