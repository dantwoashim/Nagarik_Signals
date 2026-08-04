import assert from 'node:assert/strict';
import test from 'node:test';

import { Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';

import worker from './worker.mjs';

const programId = new PublicKey('A1PDikCUQekCAbc8CHcZgEFwxxhEyspfHGEbG7PX4URP');
const authority = Keypair.generate();
const authSecret = `signer-${'s'.repeat(40)}`;
const env = {
  NAGARIK_SIGNER_AUTH_SECRET: authSecret,
  NAGARIK_SIGNER_KEYPAIR_BASE64: Buffer.from(authority.secretKey).toString('base64'),
  NAGARIK_SIGNER_PUBLIC_KEY: authority.publicKey.toBase58(),
  NAGARIK_V2_PROGRAM_ID: programId.toBase58(),
};

function unsignedTransaction({
  selectedProgram = programId,
  discriminator = 'b19fa249bcfdbe3f',
  extraInstruction = false,
} = {}) {
  const transaction = new Transaction({
    feePayer: authority.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
  });
  transaction.add(
    new TransactionInstruction({
      programId: selectedProgram,
      keys: [{ pubkey: authority.publicKey, isSigner: true, isWritable: true }],
      data: Buffer.from(`${discriminator}${'00'.repeat(32)}`, 'hex'),
    }),
  );
  if (extraInstruction) {
    transaction.add(
      new TransactionInstruction({
        programId,
        keys: [{ pubkey: authority.publicKey, isSigner: true, isWritable: true }],
        data: Buffer.from(`${discriminator}${'00'.repeat(32)}`, 'hex'),
      }),
    );
  }
  return transaction;
}

function request(transaction, bearer = authSecret) {
  return new Request('https://nagarik-edge.invalid/sign', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
      'x-nagarik-signer': 'cloudflare-policy-v1',
    },
    body: JSON.stringify({
      schemaVersion: 'nagarik-remote-sign-v1',
      transaction: transaction
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString('base64'),
    }),
  });
}

test('signs one allowlisted v2 transaction without changing its message', async () => {
  const unsigned = unsignedTransaction();
  const expectedMessage = unsigned.serializeMessage();
  const response = await worker.fetch(request(unsigned), env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.code, 'signed');
  const signed = Transaction.from(Buffer.from(body.transaction, 'base64'));
  assert.deepEqual(signed.serializeMessage(), expectedMessage);
  assert.equal(signed.signatures.length, 1);
  assert.equal(signed.signatures[0].publicKey.toBase58(), authority.publicKey.toBase58());
  assert.equal(signed.verifySignatures(), true);
});

test('rejects an invalid caller, program, discriminator, or instruction count', async () => {
  assert.equal((await worker.fetch(request(unsignedTransaction(), 'wrong'), env)).status, 401);
  assert.equal(
    (
      await worker.fetch(
        request(unsignedTransaction({ selectedProgram: Keypair.generate().publicKey })),
        env,
      )
    ).status,
    400,
  );
  assert.equal(
    (await worker.fetch(request(unsignedTransaction({ discriminator: '0000000000000000' })), env))
      .status,
    400,
  );
  assert.equal(
    (await worker.fetch(request(unsignedTransaction({ extraInstruction: true })), env)).status,
    400,
  );
});
