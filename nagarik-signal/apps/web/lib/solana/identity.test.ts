import assert from 'node:assert/strict';
import test from 'node:test';
import { Keypair } from '@solana/web3.js';
import { deriveSessionKeypair, parseRelayerSecretKey } from './identity';

test('parseRelayerSecretKey accepts JSON and raw base64 secret keys', () => {
  const expected = Keypair.generate();
  const json = JSON.stringify(Array.from(expected.secretKey));
  const base64 = Buffer.from(expected.secretKey).toString('base64');

  assert.equal(parseRelayerSecretKey(json).publicKey.toBase58(), expected.publicKey.toBase58());
  assert.equal(parseRelayerSecretKey(base64).publicKey.toBase58(), expected.publicKey.toBase58());
});

test('parseRelayerSecretKey also accepts base64-encoded Solana JSON', () => {
  const expected = Keypair.generate();
  const encodedJson = Buffer.from(JSON.stringify(Array.from(expected.secretKey))).toString('base64');
  assert.equal(parseRelayerSecretKey(encodedJson).publicKey.toBase58(), expected.publicKey.toBase58());
});

test('raw base64 remains valid when the first secret byte looks like JSON', () => {
  const seed = new Uint8Array(32);
  seed[0] = '['.charCodeAt(0);
  const expected = Keypair.fromSeed(seed);
  const base64 = Buffer.from(expected.secretKey).toString('base64');
  assert.equal(parseRelayerSecretKey(base64).publicKey.toBase58(), expected.publicKey.toBase58());
});

test('deriveSessionKeypair is stable per session and domain-separated by session id', () => {
  const secret = 'a-development-secret-with-at-least-32-bytes';
  const first = deriveSessionKeypair('resident-session-1', secret);
  const repeated = deriveSessionKeypair('resident-session-1', secret);
  const other = deriveSessionKeypair('resident-session-2', secret);

  assert.equal(first.publicKey.toBase58(), repeated.publicKey.toBase58());
  assert.notEqual(first.publicKey.toBase58(), other.publicKey.toBase58());
  assert.notEqual(
    first.publicKey.toBase58(),
    deriveSessionKeypair(' resident-session-1', secret).publicKey.toBase58()
  );
});

test('deriveSessionKeypair rejects weak derivation secrets', () => {
  assert.throws(
    () => deriveSessionKeypair('resident-session-1', 'too-short'),
    /must_be_at_least_32_bytes/
  );
});
