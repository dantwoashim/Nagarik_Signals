import { SystemProgram } from '@solana/web3.js';
import {
  deriveIssuePda,
  deriveStatusUpdatePda,
  ensureSteward,
  getProgram,
  hexToBytes32,
  parseArgs,
  sha256Hex,
} from './lib/nagarikClient';

async function main() {
  const options = parseArgs();
  const program = getProgram();
  const issueId = Number(options['issue-id'] ?? options.id ?? 1);
  const newStatus = Number(options.status ?? 2);
  const seq = Number(options.seq ?? 1);
  const proofHash = String(
    options['proof-hash'] ?? sha256Hex(`nagarik-status-proof-${issueId}-${seq}-${newStatus}`)
  );
  const stewardState = await ensureSteward(program, program.provider.publicKey);
  const issue = deriveIssuePda(issueId);
  const statusUpdate = deriveStatusUpdatePda(issue, seq);

  const txSig = await program.methods
    .updateStatus(seq, newStatus, hexToBytes32(proofHash))
    .accounts({
      issue,
      steward: stewardState.steward,
      updater: program.provider.publicKey,
      statusUpdate,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const issueAccount = await program.account.issue.fetch(issue);

  console.log(JSON.stringify({
    ok: true,
    action: 'update_status',
    stewardCreated: stewardState.created,
    stewardCreateTxSig: stewardState.txSig,
    issueId,
    issuePda: issue.toBase58(),
    statusUpdatePda: statusUpdate.toBase58(),
    txSig,
    newStatus: issueAccount.status,
    updateCount: issueAccount.updateCount,
    timelineHash: Buffer.from(issueAccount.timelineHash).toString('hex'),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
