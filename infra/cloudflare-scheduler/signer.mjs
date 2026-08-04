const MAX_REQUEST_BYTES = 4_096;
const MAX_TRANSACTION_BYTES = 1_232;
const MAX_ACCOUNT_KEYS = 32;
const MAX_INSTRUCTION_DATA_BYTES = 512;

const ED25519_PKCS8_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

const ALLOWED_DISCRIMINATORS = new Set([
  'b19fa249bcfdbe3f', // create_issue
  'b2efff730c95011b', // commit_metadata_version
  '276fbf530ffebc13', // append_lifecycle
  '55f8cc586a1d4b00', // checkpoint_handoff
  '3e716a6a12d165d1', // mark_publication_removed
]);

let cachedSigner = null;

function response(status, code, data) {
  return new Response(JSON.stringify({ ok: status === 200, code, ...data }), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}

function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function secureTextEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  return bytesEqual(new TextEncoder().encode(left), new TextEncoder().encode(right));
}

function base64Bytes(value, expectedLength) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 2_048 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new Error('signer_base64_invalid');
  }
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (expectedLength !== undefined && bytes.byteLength !== expectedLength) {
    throw new Error('signer_base64_length_invalid');
  }
  return bytes;
}

function bytesBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base58Bytes(value) {
  if (typeof value !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
    throw new Error('signer_base58_invalid');
  }
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const decoded = [0];
  for (const character of value) {
    let carry = alphabet.indexOf(character);
    if (carry < 0) throw new Error('signer_base58_invalid');
    for (let index = 0; index < decoded.length; index += 1) {
      carry += decoded[index] * 58;
      decoded[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      decoded.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let index = 0; index < value.length - 1 && value[index] === '1'; index += 1) {
    decoded.push(0);
  }
  return Uint8Array.from(decoded.reverse());
}

function readShortVector(bytes, cursor) {
  let value = 0;
  for (let shift = 0; shift <= 14; shift += 7) {
    if (cursor.offset >= bytes.byteLength) throw new Error('signer_transaction_truncated');
    const current = bytes[cursor.offset];
    cursor.offset += 1;
    value |= (current & 0x7f) << shift;
    if ((current & 0x80) === 0) return value;
  }
  throw new Error('signer_short_vector_invalid');
}

function take(bytes, cursor, length) {
  if (!Number.isInteger(length) || length < 0 || cursor.offset + length > bytes.byteLength) {
    throw new Error('signer_transaction_truncated');
  }
  const result = bytes.subarray(cursor.offset, cursor.offset + length);
  cursor.offset += length;
  return result;
}

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validateUnsignedTransaction(raw, authority, programId) {
  if (raw.byteLength < 134 || raw.byteLength > MAX_TRANSACTION_BYTES || raw[0] !== 1) {
    throw new Error('signer_transaction_size_invalid');
  }
  const emptySignature = raw.subarray(1, 65);
  if (emptySignature.some((byte) => byte !== 0)) {
    throw new Error('signer_transaction_already_signed');
  }

  const message = raw.subarray(65);
  if ((message[0] & 0x80) !== 0) throw new Error('signer_versioned_transaction_rejected');
  const cursor = { offset: 0 };
  const requiredSignatures = take(message, cursor, 1)[0];
  const readonlySigned = take(message, cursor, 1)[0];
  const readonlyUnsigned = take(message, cursor, 1)[0];
  if (requiredSignatures !== 1 || readonlySigned !== 0) {
    throw new Error('signer_header_invalid');
  }

  const accountCount = readShortVector(message, cursor);
  if (accountCount < 2 || accountCount > MAX_ACCOUNT_KEYS || readonlyUnsigned >= accountCount) {
    throw new Error('signer_account_count_invalid');
  }
  const accountKeys = [];
  for (let index = 0; index < accountCount; index += 1) {
    accountKeys.push(take(message, cursor, 32));
  }
  if (!bytesEqual(accountKeys[0], authority)) throw new Error('signer_fee_payer_invalid');
  const recentBlockhash = take(message, cursor, 32);
  if (recentBlockhash.every((byte) => byte === 0)) {
    throw new Error('signer_blockhash_invalid');
  }

  if (readShortVector(message, cursor) !== 1) {
    throw new Error('signer_instruction_count_invalid');
  }
  const programIndex = take(message, cursor, 1)[0];
  if (
    programIndex === 0 ||
    programIndex >= accountCount ||
    readonlyUnsigned === 0 ||
    programIndex < accountCount - readonlyUnsigned
  ) {
    throw new Error('signer_program_index_invalid');
  }
  if (!bytesEqual(accountKeys[programIndex], programId)) {
    throw new Error('signer_program_invalid');
  }

  const instructionAccountCount = readShortVector(message, cursor);
  const instructionAccounts = take(message, cursor, instructionAccountCount);
  if (
    !instructionAccounts.includes(0) ||
    instructionAccounts.some((index) => index >= accountCount)
  ) {
    throw new Error('signer_instruction_accounts_invalid');
  }
  const dataLength = readShortVector(message, cursor);
  if (dataLength < 8 || dataLength > MAX_INSTRUCTION_DATA_BYTES) {
    throw new Error('signer_instruction_data_invalid');
  }
  const data = take(message, cursor, dataLength);
  if (!ALLOWED_DISCRIMINATORS.has(hex(data.subarray(0, 8)))) {
    throw new Error('signer_instruction_discriminator_invalid');
  }
  if (cursor.offset !== message.byteLength) throw new Error('signer_transaction_trailing_bytes');
  return message;
}

async function signingKey(env) {
  if (cachedSigner?.publicKey === env.NAGARIK_SIGNER_PUBLIC_KEY) return cachedSigner;
  const keypair = base64Bytes(env.NAGARIK_SIGNER_KEYPAIR_BASE64, 64);
  const authority = base58Bytes(env.NAGARIK_SIGNER_PUBLIC_KEY);
  if (authority.byteLength !== 32 || !bytesEqual(keypair.subarray(32), authority)) {
    throw new Error('signer_keypair_public_key_mismatch');
  }
  const encoded = new Uint8Array(ED25519_PKCS8_PREFIX.byteLength + 32);
  encoded.set(ED25519_PKCS8_PREFIX);
  encoded.set(keypair.subarray(0, 32), ED25519_PKCS8_PREFIX.byteLength);
  const key = await crypto.subtle.importKey('pkcs8', encoded, { name: 'Ed25519' }, false, ['sign']);
  cachedSigner = { authority, key, publicKey: env.NAGARIK_SIGNER_PUBLIC_KEY };
  return cachedSigner;
}

function authorized(request, env) {
  const secret = env.NAGARIK_SIGNER_AUTH_SECRET;
  if (
    typeof secret !== 'string' ||
    new TextEncoder().encode(secret).byteLength < 32 ||
    new TextEncoder().encode(secret).byteLength > 1_024 ||
    /[\u0000-\u001f\u007f]/.test(secret)
  ) {
    return false;
  }
  return (
    secureTextEqual(request.headers.get('authorization'), `Bearer ${secret}`) &&
    request.headers.get('x-nagarik-signer') === 'cloudflare-policy-v1'
  );
}

export async function handleSignerRequest(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/sign' || url.search || url.hash) {
    return response(404, 'not_found');
  }
  if (!authorized(request, env)) return response(401, 'unauthorized');
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return response(415, 'unsupported_media_type');
  }
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return response(413, 'request_too_large');
  }

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
      return response(413, 'request_too_large');
    }
    const body = JSON.parse(text);
    if (
      !body ||
      body.schemaVersion !== 'nagarik-remote-sign-v1' ||
      Object.keys(body).sort().join(',') !== 'schemaVersion,transaction'
    ) {
      return response(400, 'request_invalid');
    }

    const raw = base64Bytes(body.transaction);
    const { authority, key } = await signingKey(env);
    const programId = base58Bytes(env.NAGARIK_V2_PROGRAM_ID);
    if (programId.byteLength !== 32) throw new Error('signer_program_id_invalid');
    const message = validateUnsignedTransaction(raw, authority, programId);
    const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', key, message));
    if (signature.byteLength !== 64) throw new Error('signer_signature_invalid');
    raw.set(signature, 1);
    return response(200, 'signed', { transaction: bytesBase64(raw) });
  } catch {
    return response(400, 'signing_policy_rejected');
  }
}
