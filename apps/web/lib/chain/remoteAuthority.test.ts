import assert from 'node:assert/strict';
import test from 'node:test';

import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';

import { RemoteTransactionAuthority } from './remoteAuthority';

const signer = Keypair.generate();
const secret = `remote-${'r'.repeat(40)}`;

function unsigned() {
  return new Transaction({
    feePayer: signer.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
  }).add(
    SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1,
    }),
  );
}

test('remote authority accepts only the expected signed transaction', async () => {
  let called = false;
  const authority = new RemoteTransactionAuthority(
    {
      endpoint: 'https://signer.example/sign',
      secret,
      publicKey: signer.publicKey.toBase58(),
    },
    async (_input, init) => {
      called = true;
      assert.equal(init?.method, 'POST');
      assert.equal((init?.headers as Record<string, string>).authorization, `Bearer ${secret}`);
      const request = JSON.parse(String(init?.body));
      const transaction = Transaction.from(Buffer.from(request.transaction, 'base64'));
      transaction.sign(signer);
      return Response.json({
        ok: true,
        code: 'signed',
        transaction: transaction.serialize().toString('base64'),
      });
    },
  );
  const transaction = unsigned();
  const expected = transaction.serializeMessage();
  const signed = await authority.signTransaction(transaction);

  assert.equal(called, true);
  assert.deepEqual(signed.serializeMessage(), expected);
  assert.equal(signed.verifySignatures(), true);
});

test('remote authority rejects a changed message, wrong signer, or failed service', async () => {
  const options = {
    endpoint: 'https://signer.example/sign',
    secret,
    publicKey: signer.publicKey.toBase58(),
  };
  await assert.rejects(
    new RemoteTransactionAuthority(options, async () => {
      const changed = unsigned();
      changed.sign(signer);
      return Response.json({ transaction: changed.serialize().toString('base64') });
    }).signTransaction(unsigned()),
    /chain_remote_signer_response_invalid/,
  );
  await assert.rejects(
    new RemoteTransactionAuthority(options, async (_input, init) => {
      const request = JSON.parse(String(init?.body));
      const transaction = Transaction.from(Buffer.from(request.transaction, 'base64'));
      transaction.sign(signer);
      transaction.signatures[0].signature![0] ^= 1;
      return Response.json({
        transaction: transaction
          .serialize({ requireAllSignatures: true, verifySignatures: false })
          .toString('base64'),
      });
    }).signTransaction(unsigned()),
    /chain_remote_signer_response_invalid/,
  );
  await assert.rejects(
    new RemoteTransactionAuthority(
      options,
      async () => new Response(null, { status: 503 }),
    ).signTransaction(unsigned()),
    /chain_remote_signer_unavailable/,
  );
});
