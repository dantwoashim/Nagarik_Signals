import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { buildChainJob, prepareChainJob } from '../apps/web/lib/chain/chainJob';
import { createConfiguredChainSigner } from '../apps/web/lib/chain/configuredSigner';
import { chainObservationMatches } from '../apps/web/lib/chain/outboxWorker';

const zero = '0'.repeat(64);

async function main() {
  const signer = await createConfiguredChainSigner({
    NODE_ENV: 'test',
    NAGARIK_SOLANA_CLUSTER: 'localnet',
    NAGARIK_RPC_PRIMARY_URL: 'http://127.0.0.1:8899',
    NAGARIK_V2_LOCAL_SIGNER_PATH: resolve(homedir(), '.config', 'solana', 'id.json'),
    NAGARIK_V2_PROGRAM_ID: 'A1PDikCUQekCAbc8CHcZgEFwxxhEyspfHGEbG7PX4URP',
  });
  const job = prepareChainJob(
    buildChainJob({
      operation: 'issue_created',
      publicIssueId: '76000000-0000-4000-8000-000000000076',
      databaseEventId: '86000000-0000-4000-8000-000000000086',
      payloadHash: '11'.repeat(32),
      expected: {
        updateCount: 0,
        timelineHead: zero,
        handoffHead: zero,
        category: 2,
        lifecycle: 0,
        publicationRemoved: false,
        metadataHash: zero,
        evidenceHash: zero,
        locationHash: zero,
      },
      next: {
        category: 2,
        lifecycle: 0,
        publicationRemoved: false,
        metadataHash: '22'.repeat(32),
        evidenceHash: '33'.repeat(32),
        locationHash: '44'.repeat(32),
      },
    }),
  );

  assert.equal(await signer.inspect(job), null);
  const signature = await signer.submit(job);
  const confirmed = await signer.confirm(job, signature);
  assert.ok(confirmed);
  assert.equal(chainObservationMatches(job, confirmed), true);
  const reread = await signer.inspect(job);
  assert.ok(reread);
  assert.equal(chainObservationMatches(job, reread), true);
  assert.equal(reread.signature, signature);

  console.log(
    JSON.stringify({
      ok: true,
      programId: signer.profile.programId,
      authority: signer.profile.authority,
      signature,
      eventAccount: confirmed.eventAccount,
      finalizedSlot: confirmed.finalizedSlot,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
