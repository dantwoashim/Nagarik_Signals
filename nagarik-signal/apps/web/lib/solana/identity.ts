import { createHmac } from 'node:crypto';
import { Keypair } from '@solana/web3.js';

const SESSION_KEY_DOMAIN = 'nagarik-signal:anonymous-session-keypair:v1\0';
const SOLANA_SECRET_KEY_BYTES = 64;

function keypairFromBytes(bytes: Uint8Array, source: string) {
  if (bytes.byteLength !== SOLANA_SECRET_KEY_BYTES) {
    throw new Error(`${source}_must_decode_to_${SOLANA_SECRET_KEY_BYTES}_bytes`);
  }

  try {
    return Keypair.fromSecretKey(bytes);
  } catch {
    throw new Error(`${source}_is_not_a_valid_solana_secret_key`);
  }
}

function parseJsonSecret(value: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('NAGARIK_RELAYER_SECRET_KEY_contains_invalid_json');
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => !Number.isInteger(item) || Number(item) < 0 || Number(item) > 255)
  ) {
    throw new Error('NAGARIK_RELAYER_SECRET_KEY_json_must_be_a_byte_array');
  }
  return keypairFromBytes(Uint8Array.from(parsed as number[]), 'NAGARIK_RELAYER_SECRET_KEY');
}

function decodeBase64(value: string) {
  const compact = value.replace(/\s/g, '');
  if (!compact || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) {
    throw new Error('NAGARIK_RELAYER_SECRET_KEY_contains_invalid_base64');
  }
  const standard = compact.replaceAll('-', '+').replaceAll('_', '/');
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

export function parseRelayerSecretKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('NAGARIK_RELAYER_SECRET_KEY_is_empty');
  if (trimmed.startsWith('[')) return parseJsonSecret(trimmed);

  const decoded = decodeBase64(trimmed);
  const decodedText = decoded.toString('utf8').trim();
  if (decoded.byteLength !== SOLANA_SECRET_KEY_BYTES && decodedText.startsWith('[')) {
    return parseJsonSecret(decodedText);
  }
  return keypairFromBytes(decoded, 'NAGARIK_RELAYER_SECRET_KEY');
}

export function deriveSessionKeypair(sessionId: string, derivationSecret: string) {
  if (!sessionId.trim()) throw new Error('session_id_is_required');

  const secretBytes = Buffer.from(derivationSecret, 'utf8');
  if (secretBytes.byteLength < 32) {
    throw new Error('NAGARIK_SESSION_DERIVATION_SECRET_must_be_at_least_32_bytes');
  }

  const seed = createHmac('sha256', secretBytes)
    .update(SESSION_KEY_DOMAIN, 'utf8')
    .update(sessionId, 'utf8')
    .digest();
  return Keypair.fromSeed(seed);
}
