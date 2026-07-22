import * as anchor from '@coral-xyz/anchor';
import { SystemProgram } from '@solana/web3.js';
import {
  deriveIssuePda,
  ensureRegistry,
  getProgram,
  hexToBytes32,
  parseArgs,
  sha256Hex,
} from './lib/nagarikClient';

async function main() {
  const options = parseArgs();
  const program = getProgram();
  const registryState = await ensureRegistry(program);
  const nextIssueId = registryState.account.issueCount.toNumber() + 1;
  const issueId = Number(options['issue-id'] ?? nextIssueId);
  const category = Number(options.category ?? 0);
  const firstObservedAt = Number(
    options['first-observed-at'] ?? Math.floor(Date.now() / 1000) - 3_600
  );
  const metadataHash = String(
    options['metadata-hash'] ?? sha256Hex(`nagarik-demo-metadata-${issueId}`)
  );
  const evidenceHash = String(
    options['evidence-hash'] ?? sha256Hex(`nagarik-demo-evidence-${issueId}`)
  );
  const locationHash = String(
    options['location-hash'] ?? sha256Hex(`kathmandu-10:nagarik-demo-location-${issueId}:v1`)
  );
  const issue = deriveIssuePda(issueId);

  const txSig = await program.methods
    .createIssue(
      new anchor.BN(issueId),
      category,
      new anchor.BN(firstObservedAt),
      hexToBytes32(metadataHash),
      hexToBytes32(evidenceHash),
      hexToBytes32(locationHash)
    )
    .accounts({
      registry: registryState.registry,
      reporter: program.provider.publicKey,
      issue,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const issueAccount = await program.account.issue.fetch(issue);

  console.log(JSON.stringify({
    ok: true,
    action: 'create_issue',
    registryInitialized: registryState.created,
    registryInitTxSig: registryState.txSig,
    issueId,
    issuePda: issue.toBase58(),
    reporter: program.provider.publicKey.toBase58(),
    txSig,
    metadataHash,
    evidenceHash,
    locationHash,
    status: issueAccount.status,
    verificationCount: issueAccount.verificationCount,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
