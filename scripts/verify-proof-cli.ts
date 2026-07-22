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

  const expectedMetadataHash =
    typeof options['metadata-hash'] === 'string' ? options['metadata-hash'] : null;
  const expectedEvidenceHash =
    typeof options['evidence-hash'] === 'string' ? options['evidence-hash'] : null;
  const metadataHash = bytesToHex(account.metadataHash);
  const evidenceHash = bytesToHex(account.evidenceHash);
  const metadataMatches = expectedMetadataHash
    ? expectedMetadataHash.toLowerCase() === metadataHash
    : null;
  const evidenceMatches = expectedEvidenceHash
    ? expectedEvidenceHash.toLowerCase() === evidenceHash
    : null;

  console.log(JSON.stringify({
    ok: metadataMatches === false || evidenceMatches === false ? false : true,
    verifier: 'nagarik-proof-cli',
    mode: 'on_chain_issue_pda_read',
    issueId,
    issuePda: issue.toBase58(),
    onChain: {
      reporter: account.reporter.toBase58(),
      category: account.category,
      status: account.status,
      verificationCount: account.verificationCount,
      updateCount: account.updateCount,
      firstObservedAt: account.firstObservedAt.toNumber(),
      createdAt: account.createdAt.toNumber(),
      metadataHash,
      evidenceHash,
      locationHash: bytesToHex(account.locationHash),
      timelineHash: bytesToHex(account.timelineHash),
      resolutionHash: bytesToHex(account.resolutionHash),
    },
    comparisons: {
      metadataMatches,
      evidenceMatches,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
