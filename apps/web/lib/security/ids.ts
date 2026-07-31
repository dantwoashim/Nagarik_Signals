import { createHash, createHmac } from 'node:crypto';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function requireIdempotencyKey(request: Request): string {
  const value = request.headers.get('idempotency-key') ?? '';
  if (!uuidV4.test(value)) throw new Error('idempotency_key_required');
  return value;
}

export function deterministicUuid(namespace: string, value: string): string {
  const bytes = createHash('sha256').update(`${namespace}\0${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}

export function deterministicUuidV4(namespace: string, value: string): string {
  const bytes = createHash('sha256').update(`${namespace}\0${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Buffer.from(bytes).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export function keyedActorHash(key: string, actor: string): string {
  if (Buffer.byteLength(key, 'utf8') < 32) throw new Error('correlation_key_too_short');
  return createHmac('sha256', key).update(actor, 'utf8').digest('hex');
}
