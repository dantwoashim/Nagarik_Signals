import {
  bytesToHex,
  deriveIssuePda,
  getProgram,
  parseArgs,
} from './lib/nagarikClient';

async function main() {
  const options = parseArgs();
  const program = getProgram();
  const issueId = Number(options['issue-id'] ?? options.id ?? 1);
  const issue = deriveIssuePda(issueId);
  const account = await program.account.issue.fetch(issue);

  console.log(JSON.stringify({
    ok: true,
    action: 'read_proof',
    issueId,
    issuePda: issue.toBase58(),
    reporter: account.reporter.toBase58(),
    category: account.category,
    status: account.status,
    firstObservedAt: account.firstObservedAt.toNumber(),
    createdAt: account.createdAt.toNumber(),
    updatedAt: account.updatedAt.toNumber(),
    resolvedAt: account.resolvedAt.toNumber(),
    metadataHash: bytesToHex(account.metadataHash),
    evidenceHash: bytesToHex(account.evidenceHash),
    locationHash: bytesToHex(account.locationHash),
    verificationCount: account.verificationCount,
    updateCount: account.updateCount,
    timelineHash: bytesToHex(account.timelineHash),
    resolutionHash: bytesToHex(account.resolutionHash),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
