import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const idl = JSON.parse(
  readFileSync(resolve(process.cwd(), "target", "idl", "nagarik_signal.json"), "utf8")
);
const program = new anchor.Program(idl, provider);
const registry = PublicKey.findProgramAddressSync(
  [Buffer.from("registry")],
  program.programId
)[0];

const STATUS_SUBMITTED = 0;
const STATUS_VERIFIED = 1;
const STATUS_IN_PROGRESS = 2;
const STATUS_RESOLVED = 3;
const TEST_WALLET_LAMPORTS = Number(
  process.env.NAGARIK_TEST_WALLET_LAMPORTS ?? Math.floor(0.02 * LAMPORTS_PER_SOL)
);

function u64Le(value: number | bigint) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function u32Le(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

function issuePda(issueId: number | bigint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("issue"), u64Le(issueId)],
    program.programId
  )[0];
}

function verificationPda(issue: PublicKey, verifier: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("verification"), issue.toBuffer(), verifier.toBuffer()],
    program.programId
  )[0];
}

function statusUpdatePda(issue: PublicKey, seq: number) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("status_update"), issue.toBuffer(), u32Le(seq)],
    program.programId
  )[0];
}

function hashBytes(seed: number) {
  return Array.from({ length: 32 }, (_, index) => (seed + index) % 255);
}

async function fund(pubkey: PublicKey) {
  const balance = await provider.connection.getBalance(pubkey);
  if (balance >= TEST_WALLET_LAMPORTS) return;
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: pubkey,
      lamports: TEST_WALLET_LAMPORTS - balance,
    })
  );
  await provider.sendAndConfirm(tx, []);
}

async function expectFailure(label: string, action: () => Promise<unknown>) {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function main() {
  const reporter = Keypair.generate();
  const verifier = Keypair.generate();
  const secondVerifier = Keypair.generate();
  const steward = Keypair.generate();
  const nonSteward = Keypair.generate();

  for (const keypair of [reporter, verifier, secondVerifier, steward, nonSteward]) {
    await fund(keypair.publicKey);
  }

  let registryAccount;
  try {
    registryAccount = await program.account.registry.fetch(registry);
  } catch {
    await program.methods
      .initializeRegistry()
      .accounts({
        registry,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    registryAccount = await program.account.registry.fetch(registry);
  }

  assert.ok(registryAccount.issueCount.toNumber() >= 0);
  assert.equal(registryAccount.authority.toBase58(), provider.wallet.publicKey.toBase58());
  const issueId = registryAccount.issueCount.toNumber() + 1;

  const stewardPda = PublicKey.findProgramAddressSync(
    [Buffer.from("steward"), steward.publicKey.toBuffer()],
    program.programId
  )[0];

  await program.methods
    .addSteward()
    .accounts({
      registry,
      authority: provider.wallet.publicKey,
      wallet: steward.publicKey,
      steward: stewardPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const stewardAccount = await program.account.steward.fetch(stewardPda);
  assert.equal(stewardAccount.active, true);
  assert.equal(stewardAccount.wallet.toBase58(), steward.publicKey.toBase58());

  const now = Math.floor(Date.now() / 1000);
  const issueOne = issuePda(issueId);
  const metadataHash = hashBytes(10);
  const evidenceHash = hashBytes(50);
  const locationHash = hashBytes(90);

  await program.methods
    .createIssue(
      new anchor.BN(issueId),
      0,
      new anchor.BN(now - 3_600),
      metadataHash,
      evidenceHash,
      locationHash
    )
    .accounts({
      registry,
      reporter: reporter.publicKey,
      issue: issueOne,
      systemProgram: SystemProgram.programId,
    })
    .signers([reporter])
    .rpc();

  let issueAccount = await program.account.issue.fetch(issueOne);
  assert.equal(issueAccount.id.toNumber(), issueId);
  assert.equal(issueAccount.reporter.toBase58(), reporter.publicKey.toBase58());
  assert.equal(issueAccount.category, 0);
  assert.equal(issueAccount.status, STATUS_SUBMITTED);
  assert.equal(issueAccount.verificationCount, 0);
  assert.notDeepEqual(issueAccount.timelineHash, metadataHash);

  await expectFailure("invalid category", () =>
    program.methods
      .createIssue(
        new anchor.BN(issueId),
        99,
        new anchor.BN(now - 3_600),
        hashBytes(11),
        hashBytes(51),
        hashBytes(91)
      )
      .accounts({
        registry,
        reporter: reporter.publicKey,
        issue: issuePda(issueId),
        systemProgram: SystemProgram.programId,
      })
      .signers([reporter])
      .rpc()
  );

  await expectFailure("zero hash", () =>
    program.methods
      .createIssue(
        new anchor.BN(issueId),
        1,
        new anchor.BN(now - 3_600),
        Array(32).fill(0),
        hashBytes(52),
        hashBytes(92)
      )
      .accounts({
        registry,
        reporter: reporter.publicKey,
        issue: issuePda(issueId),
        systemProgram: SystemProgram.programId,
      })
      .signers([reporter])
      .rpc()
  );

  await expectFailure("future observed date", () =>
    program.methods
      .createIssue(
        new anchor.BN(issueId),
        1,
        new anchor.BN(now + 600),
        hashBytes(12),
        hashBytes(52),
        hashBytes(92)
      )
      .accounts({
        registry,
        reporter: reporter.publicKey,
        issue: issuePda(issueId),
        systemProgram: SystemProgram.programId,
      })
      .signers([reporter])
      .rpc()
  );

  await expectFailure("too old observed date", () =>
    program.methods
      .createIssue(
        new anchor.BN(issueId),
        1,
        new anchor.BN(now - 181 * 86_400),
        hashBytes(13),
        hashBytes(53),
        hashBytes(93)
      )
      .accounts({
        registry,
        reporter: reporter.publicKey,
        issue: issuePda(issueId),
        systemProgram: SystemProgram.programId,
      })
      .signers([reporter])
      .rpc()
  );

  const verifierRecord = verificationPda(issueOne, verifier.publicKey);
  await program.methods
    .verifyIssue(new anchor.BN(issueId))
    .accounts({
      issue: issueOne,
      verifier: verifier.publicKey,
      verification: verifierRecord,
      systemProgram: SystemProgram.programId,
    })
    .signers([verifier])
    .rpc();

  issueAccount = await program.account.issue.fetch(issueOne);
  assert.equal(issueAccount.verificationCount, 1);

  await expectFailure("self verification", () =>
    program.methods
      .verifyIssue(new anchor.BN(issueId))
      .accounts({
        issue: issueOne,
        verifier: reporter.publicKey,
        verification: verificationPda(issueOne, reporter.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .signers([reporter])
      .rpc()
  );

  await expectFailure("duplicate verification", () =>
    program.methods
      .verifyIssue(new anchor.BN(issueId))
      .accounts({
        issue: issueOne,
        verifier: verifier.publicKey,
        verification: verifierRecord,
        systemProgram: SystemProgram.programId,
      })
      .signers([verifier])
      .rpc()
  );

  const secondVerifierRecord = verificationPda(issueOne, secondVerifier.publicKey);
  await program.methods
    .verifyIssue(new anchor.BN(issueId))
    .accounts({
      issue: issueOne,
      verifier: secondVerifier.publicKey,
      verification: secondVerifierRecord,
      systemProgram: SystemProgram.programId,
    })
    .signers([secondVerifier])
    .rpc();

  issueAccount = await program.account.issue.fetch(issueOne);
  assert.equal(issueAccount.verificationCount, 2);
  assert.equal(issueAccount.status, STATUS_VERIFIED);

  await expectFailure("non-steward update", () =>
    program.methods
      .updateStatus(1, STATUS_IN_PROGRESS, hashBytes(130))
      .accounts({
        issue: issueOne,
        steward: PublicKey.findProgramAddressSync(
          [Buffer.from("steward"), nonSteward.publicKey.toBuffer()],
          program.programId
        )[0],
        updater: nonSteward.publicKey,
        statusUpdate: statusUpdatePda(issueOne, 1),
        systemProgram: SystemProgram.programId,
      })
      .signers([nonSteward])
      .rpc()
  );

  await expectFailure("invalid status", () =>
    program.methods
      .updateStatus(1, 99, hashBytes(131))
      .accounts({
        issue: issueOne,
        steward: stewardPda,
        updater: steward.publicKey,
        statusUpdate: statusUpdatePda(issueOne, 1),
        systemProgram: SystemProgram.programId,
      })
      .signers([steward])
      .rpc()
  );

  await expectFailure("backward status transition", () =>
    program.methods
      .updateStatus(1, STATUS_SUBMITTED, hashBytes(131))
      .accounts({
        issue: issueOne,
        steward: stewardPda,
        updater: steward.publicKey,
        statusUpdate: statusUpdatePda(issueOne, 1),
        systemProgram: SystemProgram.programId,
      })
      .signers([steward])
      .rpc()
  );

  const beforeStatusTimeline = Array.from(issueAccount.timelineHash);
  await program.methods
    .updateStatus(1, STATUS_IN_PROGRESS, hashBytes(132))
    .accounts({
      issue: issueOne,
      steward: stewardPda,
      updater: steward.publicKey,
      statusUpdate: statusUpdatePda(issueOne, 1),
      systemProgram: SystemProgram.programId,
    })
    .signers([steward])
    .rpc();

  issueAccount = await program.account.issue.fetch(issueOne);
  assert.equal(issueAccount.status, STATUS_IN_PROGRESS);
  assert.equal(issueAccount.updateCount, 1);
  assert.notDeepEqual(Array.from(issueAccount.timelineHash), beforeStatusTimeline);

  await expectFailure("status sequence mismatch", () =>
    program.methods
      .updateStatus(3, STATUS_RESOLVED, hashBytes(133))
      .accounts({
        issue: issueOne,
        steward: stewardPda,
        updater: steward.publicKey,
        statusUpdate: statusUpdatePda(issueOne, 3),
        systemProgram: SystemProgram.programId,
      })
      .signers([steward])
      .rpc()
  );

  await program.methods
    .updateStatus(2, STATUS_RESOLVED, hashBytes(134))
    .accounts({
      issue: issueOne,
      steward: stewardPda,
      updater: steward.publicKey,
      statusUpdate: statusUpdatePda(issueOne, 2),
      systemProgram: SystemProgram.programId,
    })
    .signers([steward])
    .rpc();

  issueAccount = await program.account.issue.fetch(issueOne);
  assert.equal(issueAccount.status, STATUS_RESOLVED);
  assert.equal(issueAccount.updateCount, 2);
  assert.ok(issueAccount.resolvedAt.toNumber() > 0);
  assert.deepEqual(Array.from(issueAccount.resolutionHash), hashBytes(134));

  await expectFailure("closed issue status update", () =>
    program.methods
      .updateStatus(3, STATUS_IN_PROGRESS, hashBytes(135))
      .accounts({
        issue: issueOne,
        steward: stewardPda,
        updater: steward.publicKey,
        statusUpdate: statusUpdatePda(issueOne, 3),
        systemProgram: SystemProgram.programId,
      })
      .signers([steward])
      .rpc()
  );

  const closedVerifier = Keypair.generate();
  await fund(closedVerifier.publicKey);
  await expectFailure("resolved issue verification", () =>
    program.methods
      .verifyIssue(new anchor.BN(issueId))
      .accounts({
        issue: issueOne,
        verifier: closedVerifier.publicKey,
        verification: verificationPda(issueOne, closedVerifier.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .signers([closedVerifier])
      .rpc()
  );

  console.log(JSON.stringify({
    ok: true,
    registry: registry.toBase58(),
    issue: issueOne.toBase58(),
    steward: stewardPda.toBase58(),
    checks: [
      "initialize_registry",
      "add_steward",
      "create_issue",
      "invalid_create_inputs",
      "verify_issue",
      "self_verification_rejected",
      "duplicate_verification_rejected",
      "status_update",
      "non_steward_rejected",
      "invalid_status_rejected",
      "backward_status_transition_rejected",
      "sequence_mismatch_rejected",
      "closed_status_update_rejected",
      "resolved_issue_rejects_verification",
      "timeline_hash_changes",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
