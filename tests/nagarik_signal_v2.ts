import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as anchor from '@coral-xyz/anchor';
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const idl = JSON.parse(
  readFileSync(resolve(process.cwd(), 'target', 'idl', 'nagarik_signal_v2.json'), 'utf8'),
);
const program = new anchor.Program(idl, provider);
const genesisAuthority = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'target', 'deploy', 'nagarik_signal_v2-genesis-authority.json'),
        'utf8',
      ),
    ),
  ),
);
const [protocolConfig] = PublicKey.findProgramAddressSync(
  [Buffer.from('protocol'), Buffer.from('v2')],
  program.programId,
);
const roleBitsAll = 0x000f;
const zero = Array(32).fill(0);

function hash(seed: number): number[] {
  return Array.from({ length: 32 }, (_, index) => (seed + index) % 256);
}

function roleGrant(subject: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('role'), protocolConfig.toBuffer(), subject.toBuffer()],
    program.programId,
  )[0];
}

function issuePda(issueKey: number[]): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('issue'), protocolConfig.toBuffer(), Buffer.from(issueKey)],
    program.programId,
  )[0];
}

function eventPda(issue: PublicKey, eventId: number[]): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('event'), issue.toBuffer(), Buffer.from(eventId)],
    program.programId,
  )[0];
}

function appendAccounts(actor: PublicKey, issue: PublicKey, event: PublicKey) {
  return {
    actor,
    protocolConfig,
    roleGrant: roleGrant(actor),
    issueCommitment: issue,
    commitmentEvent: event,
    systemProgram: SystemProgram.programId,
  };
}

async function fund(pubkey: PublicKey, lamports = Math.floor(0.08 * LAMPORTS_PER_SOL)) {
  const current = await provider.connection.getBalance(pubkey);
  if (current >= lamports) return;
  await provider.sendAndConfirm(
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: pubkey,
        lamports: lamports - current,
      }),
    ),
  );
}

async function expectFailure(label: string, operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function config() {
  return program.account.protocolConfig.fetch(protocolConfig);
}

async function revision(): Promise<anchor.BN> {
  return (await config()).revision;
}

async function createIssue(input: {
  actor?: Keypair;
  issueKey: number[];
  eventId: number[];
  category?: number;
  payload?: number[];
  metadata?: number[];
  evidence?: number[];
  location?: number[];
  issue?: PublicKey;
  event?: PublicKey;
}) {
  const actor = input.actor;
  const actorPublicKey = actor?.publicKey ?? provider.wallet.publicKey;
  const issue = input.issue ?? issuePda(input.issueKey);
  const event = input.event ?? eventPda(issue, input.eventId);
  const builder = program.methods
    .createIssue(
      input.issueKey,
      input.eventId,
      input.category ?? 2,
      input.payload ?? hash(30),
      input.metadata ?? hash(60),
      input.evidence ?? hash(90),
      input.location ?? hash(120),
    )
    .accountsStrict(appendAccounts(actorPublicKey, issue, event));
  if (actor) builder.signers([actor]);
  return builder.rpc();
}

async function main() {
  assert.equal(program.programId.toBase58(), 'A1PDikCUQekCAbc8CHcZgEFwxxhEyspfHGEbG7PX4URP');
  assert.equal(
    genesisAuthority.publicKey.toBase58(),
    '94GGj4zzhRQV5FzpL3RmYoZrH5qoLhdRMKYj9t9ndv5i',
  );
  await fund(genesisAuthority.publicKey);

  await program.methods
    .initializeProtocol()
    .accountsStrict({
      payer: provider.wallet.publicKey,
      genesisAuthority: genesisAuthority.publicKey,
      protocolConfig,
      systemProgram: SystemProgram.programId,
    })
    .signers([genesisAuthority])
    .rpc();
  let protocol = await config();
  assert.equal(protocol.version, 2);
  assert.equal(protocol.paused, true);
  assert.equal(protocol.authority.toBase58(), genesisAuthority.publicKey.toBase58());

  const providerRole = roleGrant(provider.wallet.publicKey);
  await program.methods
    .setRole(await revision(), new anchor.BN(0), roleBitsAll, true)
    .accountsStrict({
      authority: genesisAuthority.publicKey,
      protocolConfig,
      subject: provider.wallet.publicKey,
      roleGrant: providerRole,
      systemProgram: SystemProgram.programId,
    })
    .signers([genesisAuthority])
    .rpc();
  let grant = await program.account.roleGrant.fetch(providerRole);
  assert.equal(grant.active, true);
  assert.equal(grant.roleBits, roleBitsAll);

  await program.methods
    .setRole(await revision(), grant.revision, roleBitsAll, false)
    .accountsStrict({
      authority: genesisAuthority.publicKey,
      protocolConfig,
      subject: provider.wallet.publicKey,
      roleGrant: providerRole,
      systemProgram: SystemProgram.programId,
    })
    .signers([genesisAuthority])
    .rpc();
  grant = await program.account.roleGrant.fetch(providerRole);
  assert.equal(grant.active, false);
  await program.methods
    .setRole(await revision(), grant.revision, roleBitsAll, true)
    .accountsStrict({
      authority: genesisAuthority.publicKey,
      protocolConfig,
      subject: provider.wallet.publicKey,
      roleGrant: providerRole,
      systemProgram: SystemProgram.programId,
    })
    .signers([genesisAuthority])
    .rpc();

  const nextAuthority = Keypair.generate();
  const outsider = Keypair.generate();
  await fund(outsider.publicKey);
  await expectFailure('unauthorized protocol change', async () =>
    program.methods
      .setPause(await revision(), false)
      .accountsStrict({ authority: outsider.publicKey, protocolConfig })
      .signers([outsider])
      .rpc(),
  );
  await program.methods
    .proposeAuthority(await revision(), nextAuthority.publicKey)
    .accountsStrict({ authority: genesisAuthority.publicKey, protocolConfig })
    .signers([genesisAuthority])
    .rpc();
  const staleRevision = new anchor.BN((await revision()).subn(1));
  await expectFailure('stale authority acceptance', () =>
    program.methods
      .acceptAuthority(staleRevision)
      .accountsStrict({ pendingAuthority: nextAuthority.publicKey, protocolConfig })
      .signers([nextAuthority])
      .rpc(),
  );
  await program.methods
    .acceptAuthority(await revision())
    .accountsStrict({ pendingAuthority: nextAuthority.publicKey, protocolConfig })
    .signers([nextAuthority])
    .rpc();
  await program.methods
    .proposeAuthority(await revision(), genesisAuthority.publicKey)
    .accountsStrict({ authority: nextAuthority.publicKey, protocolConfig })
    .signers([nextAuthority])
    .rpc();
  await program.methods
    .acceptAuthority(await revision())
    .accountsStrict({ pendingAuthority: genesisAuthority.publicKey, protocolConfig })
    .signers([genesisAuthority])
    .rpc();
  const initialGovernanceSignature = await program.methods
    .setPause(await revision(), false)
    .accountsStrict({ authority: genesisAuthority.publicKey, protocolConfig })
    .signers([genesisAuthority])
    .rpc();
  const initialGovernanceStatus = await provider.connection.confirmTransaction(
    initialGovernanceSignature,
    'finalized',
  );
  assert.equal(initialGovernanceStatus.value.err, null);
  protocol = await config();
  assert.equal(protocol.paused, false);
  assert.equal(protocol.pendingAuthority, null);

  const unauthorizedKey = hash(1);
  const unauthorizedEvent = hash(2);
  await expectFailure('missing role grant', () =>
    createIssue({
      actor: outsider,
      issueKey: unauthorizedKey,
      eventId: unauthorizedEvent,
    }),
  );
  await expectFailure('zero issue commitment', () =>
    createIssue({ issueKey: zero, eventId: hash(3) }),
  );
  await expectFailure('invalid category', () =>
    createIssue({ issueKey: hash(4), eventId: hash(5), category: 7 }),
  );

  const issueKey = hash(10);
  const createdEventId = hash(11);
  const wrongIssue = issuePda(hash(12));
  await expectFailure('wrong issue PDA', () =>
    createIssue({
      issueKey,
      eventId: createdEventId,
      issue: wrongIssue,
      event: eventPda(wrongIssue, createdEventId),
    }),
  );

  const issue = issuePda(issueKey);
  const createdEvent = eventPda(issue, createdEventId);
  await createIssue({ issueKey, eventId: createdEventId });
  await expectFailure('issue creation replay', () =>
    createIssue({ issueKey, eventId: createdEventId }),
  );
  let issueAccount = await program.account.issueCommitment.fetch(issue);
  assert.equal(issueAccount.updateCount.toNumber(), 1);
  assert.equal(issueAccount.lifecycle, 0);
  assert.equal(issueAccount.publicationRemoved, false);
  const created = await program.account.commitmentEvent.fetch(createdEvent);
  assert.equal(created.sequence.toNumber(), 1);
  assert.equal(created.eventType, 0);

  const staleEventId = hash(13);
  await expectFailure('stale update count', () =>
    program.methods
      .appendLifecycle(staleEventId, new anchor.BN(0), zero, zero, 0, 1, hash(14))
      .accountsStrict(
        appendAccounts(provider.wallet.publicKey, issue, eventPda(issue, staleEventId)),
      )
      .rpc(),
  );
  const staleHeadEventId = hash(15);
  await expectFailure('stale timeline head', () =>
    program.methods
      .appendLifecycle(staleHeadEventId, new anchor.BN(1), hash(200), zero, 0, 1, hash(16))
      .accountsStrict(
        appendAccounts(provider.wallet.publicKey, issue, eventPda(issue, staleHeadEventId)),
      )
      .rpc(),
  );
  const invalidLifecycleEventId = hash(17);
  await expectFailure('invalid lifecycle transition', () =>
    program.methods
      .appendLifecycle(
        invalidLifecycleEventId,
        issueAccount.updateCount,
        issueAccount.timelineHead,
        issueAccount.handoffHead,
        0,
        2,
        hash(18),
      )
      .accountsStrict(
        appendAccounts(provider.wallet.publicKey, issue, eventPda(issue, invalidLifecycleEventId)),
      )
      .rpc(),
  );

  const metadataEventId = hash(20);
  const metadataEvent = eventPda(issue, metadataEventId);
  await program.methods
    .commitMetadataVersion(
      metadataEventId,
      issueAccount.updateCount,
      issueAccount.timelineHead,
      issueAccount.handoffHead,
      issueAccount.category,
      1,
      hash(21),
      hash(22),
      hash(23),
      hash(24),
    )
    .accountsStrict(appendAccounts(provider.wallet.publicKey, issue, metadataEvent))
    .rpc();
  issueAccount = await program.account.issueCommitment.fetch(issue);
  assert.equal(issueAccount.updateCount.toNumber(), 2);
  assert.equal(issueAccount.category, 1);
  await expectFailure('metadata event replay', () =>
    program.methods
      .commitMetadataVersion(
        metadataEventId,
        new anchor.BN(1),
        created.newHead,
        zero,
        2,
        1,
        hash(21),
        hash(22),
        hash(23),
        hash(24),
      )
      .accountsStrict(appendAccounts(provider.wallet.publicKey, issue, metadataEvent))
      .rpc(),
  );

  const lifecycleEventId = hash(30);
  await program.methods
    .appendLifecycle(
      lifecycleEventId,
      issueAccount.updateCount,
      issueAccount.timelineHead,
      issueAccount.handoffHead,
      0,
      1,
      hash(31),
    )
    .accountsStrict(
      appendAccounts(provider.wallet.publicKey, issue, eventPda(issue, lifecycleEventId)),
    )
    .rpc();
  issueAccount = await program.account.issueCommitment.fetch(issue);
  assert.equal(issueAccount.updateCount.toNumber(), 3);
  assert.equal(issueAccount.lifecycle, 1);

  const handoffEventId = hash(40);
  const timelineBeforeHandoff = [...issueAccount.timelineHead];
  await program.methods
    .checkpointHandoff(
      handoffEventId,
      issueAccount.updateCount,
      issueAccount.timelineHead,
      issueAccount.handoffHead,
      hash(41),
    )
    .accountsStrict(
      appendAccounts(provider.wallet.publicKey, issue, eventPda(issue, handoffEventId)),
    )
    .rpc();
  issueAccount = await program.account.issueCommitment.fetch(issue);
  assert.equal(issueAccount.updateCount.toNumber(), 4);
  assert.deepEqual(issueAccount.timelineHead, timelineBeforeHandoff);
  assert.notDeepEqual(issueAccount.handoffHead, zero);

  const removalEventId = hash(50);
  await program.methods
    .markPublicationRemoved(
      removalEventId,
      issueAccount.updateCount,
      issueAccount.timelineHead,
      issueAccount.handoffHead,
      hash(51),
      hash(52),
    )
    .accountsStrict(
      appendAccounts(provider.wallet.publicKey, issue, eventPda(issue, removalEventId)),
    )
    .rpc();
  issueAccount = await program.account.issueCommitment.fetch(issue);
  assert.equal(issueAccount.updateCount.toNumber(), 5);
  assert.equal(issueAccount.publicationRemoved, true);
  const terminalEventId = hash(53);
  await expectFailure('removed issue is terminal', () =>
    program.methods
      .appendLifecycle(
        terminalEventId,
        issueAccount.updateCount,
        issueAccount.timelineHead,
        issueAccount.handoffHead,
        1,
        2,
        hash(54),
      )
      .accountsStrict(
        appendAccounts(provider.wallet.publicKey, issue, eventPda(issue, terminalEventId)),
      )
      .rpc(),
  );

  const concurrent = [
    { issueKey: hash(70), eventId: hash(71) },
    { issueKey: hash(80), eventId: hash(81) },
  ];
  await Promise.all(concurrent.map((entry) => createIssue(entry)));
  for (const entry of concurrent) {
    const account = await program.account.issueCommitment.fetch(issuePda(entry.issueKey));
    assert.equal(account.updateCount.toNumber(), 1);
  }

  await program.methods
    .setPause(await revision(), true)
    .accountsStrict({ authority: genesisAuthority.publicKey, protocolConfig })
    .signers([genesisAuthority])
    .rpc();
  await expectFailure('paused protocol write', () =>
    createIssue({ issueKey: hash(90), eventId: hash(91) }),
  );
  const finalGovernanceSignature = await program.methods
    .setPause(await revision(), false)
    .accountsStrict({ authority: genesisAuthority.publicKey, protocolConfig })
    .signers([genesisAuthority])
    .rpc();
  const finalGovernanceStatus = await provider.connection.confirmTransaction(
    finalGovernanceSignature,
    'finalized',
  );
  assert.equal(finalGovernanceStatus.value.err, null);

  console.log(
    JSON.stringify({
      ok: true,
      programId: program.programId.toBase58(),
      protocolConfig: protocolConfig.toBase58(),
      issue: issue.toBase58(),
      finalSequence: issueAccount.updateCount.toNumber(),
      checks: [
        'authority_transfer',
        'role_revoke_reactivate',
        'pause',
        'unauthorized',
        'wrong_pda',
        'replay',
        'stale_count',
        'stale_head',
        'invalid_lifecycle',
        'metadata',
        'handoff',
        'removal_terminal',
        'concurrent_issue_creation',
      ],
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
